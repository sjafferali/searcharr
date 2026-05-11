"""
Background poller that maintains ``feed_items`` history.

The poller runs as a single asyncio task started in the FastAPI lifespan
context manager. On each tick it queries which feeds are due (based on
``poll_interval_minutes`` and ``last_polled_at``), runs the existing
``FeedService.fetch`` for each one (bounded by a small semaphore), and
upserts the returned ``SearchResult`` payloads into ``feed_items`` keyed
by ``(feed_id, dedup_key)``. A daily retention sweep prunes rows whose
``last_seen_at`` is older than the feed's ``retention_days`` window.

The same upsert helper backs the synchronous ``POST /feeds/{id}/refresh``
endpoint via ``refresh_now``, so a manual refresh and a scheduled poll
land in the same code path.
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import selectinload

from app.models import Feed, FeedItem
from app.schemas.search import SearchResult
from app.services.bookmark import compute_dedup_key
from app.services.feed import FeedService

logger = logging.getLogger(__name__)


class FeedPoller:
    """Periodic background poller for saved feeds."""

    POLL_TICK_SECONDS = 30
    CONCURRENT_FEED_POLLS = 3
    RETENTION_INTERVAL_SECONDS = 86_400

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._stop = asyncio.Event()
        self._semaphore = asyncio.Semaphore(self.CONCURRENT_FEED_POLLS)
        self._last_retention_at: datetime | None = None

    async def run_forever(self) -> None:
        """Main loop. Sleeps between ticks; exits cleanly on ``stop()``."""
        logger.info("FeedPoller started (tick=%ss)", self.POLL_TICK_SECONDS)
        while not self._stop.is_set():
            try:
                await self._tick()
            except Exception:
                logger.exception("FeedPoller tick failed; continuing")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.POLL_TICK_SECONDS)
            except TimeoutError:
                pass
        logger.info("FeedPoller stopped")

    def stop(self) -> None:
        self._stop.set()

    async def _tick(self) -> None:
        async with self._session_factory() as session:
            due_ids = await self._load_due_feed_ids(session)
        if due_ids:
            logger.debug("FeedPoller dispatching %d due feed(s): %s", len(due_ids), due_ids)
            await asyncio.gather(*(self._poll_one(fid) for fid in due_ids))
        await self._maybe_run_retention()

    async def _load_due_feed_ids(self, session: AsyncSession) -> list[int]:
        """
        Return feed ids that should be polled now.

        A feed is due when polling is enabled and either it has never been
        polled, or its last poll plus its interval has elapsed.
        """
        now = datetime.now(UTC)
        stmt = select(Feed.id, Feed.last_polled_at, Feed.poll_interval_minutes).where(
            Feed.polling_enabled.is_(True)
        )
        result = await session.execute(stmt)
        due: list[int] = []
        for feed_id, last_polled_at, interval in result.all():
            if last_polled_at is None:
                due.append(feed_id)
                continue
            if last_polled_at.tzinfo is None:
                last_polled_at = last_polled_at.replace(tzinfo=UTC)
            if last_polled_at + timedelta(minutes=interval) <= now:
                due.append(feed_id)
        return due

    async def _poll_one(self, feed_id: int) -> None:
        async with self._semaphore:
            try:
                async with self._session_factory() as session:
                    feed = await self._load_feed(session, feed_id)
                    if feed is None:
                        return
                    service = FeedService(session)
                    results, errors, sources_queried = await service.fetch(feed)
                    if errors:
                        logger.info(
                            "FeedPoller feed %s: %d source errors: %s",
                            feed_id,
                            len(errors),
                            errors[:3],
                        )
                    await self._upsert_items(session, feed_id, results)
                    feed.last_polled_at = datetime.now(UTC)
                    await session.commit()
                    logger.debug(
                        "FeedPoller polled feed %s: %d items from %d source(s)",
                        feed_id,
                        len(results),
                        sources_queried,
                    )
            except Exception:
                logger.exception("FeedPoller failed to poll feed %s", feed_id)

    @staticmethod
    async def _load_feed(session: AsyncSession, feed_id: int) -> Feed | None:
        stmt = select(Feed).where(Feed.id == feed_id).options(selectinload(Feed.indexers))
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def _upsert_items(
        self,
        session: AsyncSession,
        feed_id: int,
        results: list[SearchResult],
    ) -> tuple[int, int]:
        """
        Insert new rows and refresh mutable fields on existing rows.

        Returns ``(inserted, updated)`` for caller logging/tests. Items that
        don't yield a ``dedup_key`` (no magnet/torrent/info URL) are skipped
        because there's no stable identity to upsert against.
        """
        if not results:
            return 0, 0

        now = datetime.now(UTC)
        inserted = 0
        updated = 0
        seen_keys: set[str] = set()

        for result in results:
            dedup_key = compute_dedup_key(
                magnet_link=result.magnet_link,
                torrent_url=result.torrent_url,
                info_url=result.info_url,
            )
            if not dedup_key:
                continue
            # Two upstream rows may hash to the same dedup_key (e.g. duplicate
            # magnets across mirrors). Keep the first occurrence for this tick.
            if dedup_key in seen_keys:
                continue
            seen_keys.add(dedup_key)

            existing = await session.execute(
                select(FeedItem).where(
                    FeedItem.feed_id == feed_id,
                    FeedItem.dedup_key == dedup_key,
                )
            )
            row = existing.scalar_one_or_none()

            if row is None:
                session.add(
                    FeedItem(
                        feed_id=feed_id,
                        dedup_key=dedup_key,
                        first_seen_at=now,
                        last_seen_at=now,
                        title=result.title,
                        source_type=result.source_type,
                        source_instance_name=result.source,
                        indexer=result.indexer,
                        size_bytes=result.size,
                        seeders=result.seeders,
                        leechers=result.leechers,
                        pub_date=result.date,
                        category=result.category,
                        magnet_link=result.magnet_link,
                        torrent_url=result.torrent_url,
                        info_url=result.info_url,
                        freeleech=result.freeleech,
                        download_volume_factor=result.download_volume_factor,
                    )
                )
                inserted += 1
            else:
                row.last_seen_at = now
                row.title = result.title
                row.size_bytes = result.size
                row.seeders = result.seeders
                row.leechers = result.leechers
                row.freeleech = result.freeleech
                row.download_volume_factor = result.download_volume_factor
                if result.date is not None:
                    row.pub_date = result.date
                if result.magnet_link:
                    row.magnet_link = result.magnet_link
                if result.torrent_url:
                    row.torrent_url = result.torrent_url
                if result.info_url:
                    row.info_url = result.info_url
                updated += 1

        await session.flush()
        return inserted, updated

    async def _maybe_run_retention(self) -> None:
        now = datetime.now(UTC)
        if (
            self._last_retention_at is not None
            and (now - self._last_retention_at).total_seconds() < self.RETENTION_INTERVAL_SECONDS
        ):
            return
        try:
            async with self._session_factory() as session:
                deleted = await self._run_retention(session)
                await session.commit()
                if deleted:
                    logger.info("FeedPoller retention pruned %d item(s)", deleted)
        except Exception:
            logger.exception("FeedPoller retention sweep failed")
        finally:
            self._last_retention_at = now

    @staticmethod
    async def _run_retention(session: AsyncSession) -> int:
        """Delete feed items past each feed's ``retention_days`` cutoff."""
        feeds = (await session.execute(select(Feed.id, Feed.retention_days))).all()
        now = datetime.now(UTC)
        total_deleted = 0
        for feed_id, retention_days in feeds:
            cutoff = now - timedelta(days=retention_days)
            result = await session.execute(
                delete(FeedItem).where(
                    FeedItem.feed_id == feed_id,
                    FeedItem.last_seen_at < cutoff,
                )
            )
            total_deleted += getattr(result, "rowcount", 0) or 0
        return total_deleted

    async def refresh_now(self, feed_id: int) -> tuple[int, int, list[str]]:
        """
        Run one synchronous poll for a single feed.

        Used by ``POST /feeds/{id}/refresh``. Returns
        ``(inserted, updated, errors)`` so the API can surface any source
        errors. Bumps ``last_polled_at`` so the scheduled loop skips this
        feed for its next normal interval.
        """
        async with self._session_factory() as session:
            feed = await self._load_feed(session, feed_id)
            if feed is None:
                return 0, 0, ["Feed not found"]
            service = FeedService(session)
            results, errors, _sources = await service.fetch(feed)
            inserted, updated = await self._upsert_items(session, feed_id, results)
            feed.last_polled_at = datetime.now(UTC)
            await session.commit()
            return inserted, updated, errors


__all__ = ["FeedPoller"]
