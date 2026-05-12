"""
Tests for the FeedPoller background poller.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from app.core.database import Base
from app.models import Feed, FeedIndexer, FeedItem
from app.schemas.search import IndexerError, SearchResult
from app.services.feed_poller import FeedPoller
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.future import select


def _result(
    *,
    id_: str = "abc123",
    title: str = "Ubuntu 24.04 LTS",
    seeders: int = 50,
    leechers: int = 2,
    size: int = 4_700_000_000,
    freeleech: bool = False,
    indexer: str = "iptorrents",
    source: str = "Jackett",
    source_type: str = "jackett",
    magnet_link: str | None = None,
    torrent_url: str | None = "http://example.com/x.torrent",
    info_url: str | None = None,
    date: datetime | None = None,
) -> SearchResult:
    return SearchResult(
        id=id_,
        title=title,
        source=source,
        source_type=source_type,
        indexer=indexer,
        size=size,
        size_formatted="4.7 GB",
        seeders=seeders,
        leechers=leechers,
        date=date if date is not None else datetime.now(UTC),
        category="Software",
        magnet_link=magnet_link,
        torrent_url=torrent_url,
        info_url=info_url,
        freeleech=freeleech,
        download_volume_factor=0.0 if freeleech else 1.0,
    )


@pytest_asyncio.fixture
async def poller_engine():
    """Per-test in-memory database scoped to the poller tests.

    Distinct from the global ``db_session`` fixture because the poller owns
    its own session factory and needs a stable shared backing store across
    multiple sessions inside a single test.
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    try:
        yield factory
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


async def _make_feed(factory, **overrides) -> int:
    defaults: dict = {
        "name": "Test",
        "description": None,
        "category": "All",
        "freeleech_only": False,
        "min_seeders": 0,
        "sort_strategy": "date_desc",
        "poll_interval_minutes": 15,
        "retention_days": 30,
        "polling_enabled": True,
    }
    defaults.update(overrides)
    async with factory() as session:
        feed = Feed(**defaults)
        feed.indexers.append(
            FeedIndexer(
                source_type="jackett",
                source_instance_id=1,
                source_instance_name="J",
                indexer_id="ip",
                indexer_name="IP",
            )
        )
        session.add(feed)
        await session.commit()
        return feed.id


class TestDueFeedsQuery:
    @pytest.mark.asyncio
    async def test_never_polled_feed_is_due(self, poller_engine):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)
        async with poller_engine() as session:
            due = await poller._load_due_feed_ids(session)
        assert feed_id in due

    @pytest.mark.asyncio
    async def test_recently_polled_feed_is_not_due(self, poller_engine):
        feed_id = await _make_feed(poller_engine, poll_interval_minutes=15)
        async with poller_engine() as session:
            feed = (await session.execute(select(Feed).where(Feed.id == feed_id))).scalar_one()
            feed.last_polled_at = datetime.now(UTC) - timedelta(minutes=5)
            await session.commit()

        poller = FeedPoller(poller_engine)
        async with poller_engine() as session:
            due = await poller._load_due_feed_ids(session)
        assert feed_id not in due

    @pytest.mark.asyncio
    async def test_overdue_feed_is_due(self, poller_engine):
        feed_id = await _make_feed(poller_engine, poll_interval_minutes=15)
        async with poller_engine() as session:
            feed = (await session.execute(select(Feed).where(Feed.id == feed_id))).scalar_one()
            feed.last_polled_at = datetime.now(UTC) - timedelta(minutes=30)
            await session.commit()

        poller = FeedPoller(poller_engine)
        async with poller_engine() as session:
            due = await poller._load_due_feed_ids(session)
        assert feed_id in due

    @pytest.mark.asyncio
    async def test_disabled_feed_is_skipped(self, poller_engine):
        feed_id = await _make_feed(poller_engine, polling_enabled=False)
        poller = FeedPoller(poller_engine)
        async with poller_engine() as session:
            due = await poller._load_due_feed_ids(session)
        assert feed_id not in due


class TestUpsertItems:
    @pytest.mark.asyncio
    async def test_inserts_new_items(self, poller_engine):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)
        results = [
            _result(id_="a", torrent_url="http://a.example/x.torrent"),
            _result(id_="b", torrent_url="http://b.example/x.torrent"),
        ]
        async with poller_engine() as session:
            inserted, updated = await poller._upsert_items(session, feed_id, results)
            await session.commit()
        assert (inserted, updated) == (2, 0)

        async with poller_engine() as session:
            rows = (
                (await session.execute(select(FeedItem).where(FeedItem.feed_id == feed_id)))
                .scalars()
                .all()
            )
        assert len(rows) == 2

    @pytest.mark.asyncio
    async def test_skips_items_without_dedup_key(self, poller_engine):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)
        results = [
            _result(id_="a", magnet_link=None, torrent_url=None, info_url=None),
        ]
        async with poller_engine() as session:
            inserted, updated = await poller._upsert_items(session, feed_id, results)
            await session.commit()
        assert (inserted, updated) == (0, 0)

    @pytest.mark.asyncio
    async def test_second_poll_updates_mutable_fields_and_last_seen(self, poller_engine):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)

        first = [_result(id_="a", seeders=10, freeleech=False)]
        async with poller_engine() as session:
            await poller._upsert_items(session, feed_id, first)
            await session.commit()

        async with poller_engine() as session:
            row = (
                await session.execute(select(FeedItem).where(FeedItem.feed_id == feed_id))
            ).scalar_one()
            first_seen = row.first_seen_at
            first_last_seen = row.last_seen_at

        # Second poll: same dedup key, different freeleech / seeders.
        second = [_result(id_="a", seeders=99, freeleech=True)]
        async with poller_engine() as session:
            inserted, updated = await poller._upsert_items(session, feed_id, second)
            await session.commit()

        assert (inserted, updated) == (0, 1)

        async with poller_engine() as session:
            row = (
                await session.execute(select(FeedItem).where(FeedItem.feed_id == feed_id))
            ).scalar_one()
        assert row.first_seen_at == first_seen
        assert row.last_seen_at >= first_last_seen
        assert row.seeders == 99
        assert row.freeleech is True

    @pytest.mark.asyncio
    async def test_duplicate_dedup_keys_in_same_batch_collapse(self, poller_engine):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)
        # Two results pointing at the same torrent URL: dedup keys collide.
        results = [
            _result(id_="a", torrent_url="http://same/x.torrent"),
            _result(id_="b", torrent_url="http://same/x.torrent"),
        ]
        async with poller_engine() as session:
            inserted, updated = await poller._upsert_items(session, feed_id, results)
            await session.commit()
        assert (inserted, updated) == (1, 0)


class TestRetention:
    @pytest.mark.asyncio
    async def test_drops_items_past_retention(self, poller_engine):
        feed_id = await _make_feed(poller_engine, retention_days=1)
        poller = FeedPoller(poller_engine)
        # Seed two items: one fresh, one well past the retention window.
        async with poller_engine() as session:
            fresh = FeedItem(
                feed_id=feed_id,
                dedup_key="url:http://fresh",
                first_seen_at=datetime.now(UTC),
                last_seen_at=datetime.now(UTC),
                title="fresh",
                source_type="jackett",
                source_instance_name="J",
                indexer="ip",
                size_bytes=0,
            )
            stale = FeedItem(
                feed_id=feed_id,
                dedup_key="url:http://stale",
                first_seen_at=datetime.now(UTC) - timedelta(days=10),
                last_seen_at=datetime.now(UTC) - timedelta(days=5),
                title="stale",
                source_type="jackett",
                source_instance_name="J",
                indexer="ip",
                size_bytes=0,
            )
            session.add_all([fresh, stale])
            await session.commit()

        async with poller_engine() as session:
            deleted = await poller._run_retention(session)
            await session.commit()
        assert deleted == 1

        async with poller_engine() as session:
            rows = (
                (await session.execute(select(FeedItem).where(FeedItem.feed_id == feed_id)))
                .scalars()
                .all()
            )
        assert [r.dedup_key for r in rows] == ["url:http://fresh"]


class TestRefreshNow:
    @pytest.mark.asyncio
    async def test_refresh_now_updates_last_polled_at(self, poller_engine, monkeypatch):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)

        async def fake_fetch(self, feed):
            return [_result(id_="a")], [], 1

        monkeypatch.setattr("app.services.feed_poller.FeedService.fetch", fake_fetch)

        before = datetime.now(UTC)
        inserted, updated, errors = await poller.refresh_now(feed_id)
        assert (inserted, updated, errors) == (1, 0, [])

        async with poller_engine() as session:
            feed = (await session.execute(select(Feed).where(Feed.id == feed_id))).scalar_one()
        assert feed.last_polled_at is not None
        last_polled = feed.last_polled_at
        if last_polled.tzinfo is None:
            last_polled = last_polled.replace(tzinfo=UTC)
        assert last_polled >= before

    @pytest.mark.asyncio
    async def test_refresh_now_missing_feed_returns_error(self, poller_engine):
        poller = FeedPoller(poller_engine)
        inserted, updated, errors = await poller.refresh_now(99999)
        assert (inserted, updated) == (0, 0)
        assert errors and "not found" in errors[0].message.lower()

    @pytest.mark.asyncio
    async def test_refresh_now_persists_source_errors(self, poller_engine, monkeypatch):
        feed_id = await _make_feed(poller_engine)
        poller = FeedPoller(poller_engine)

        async def fake_fetch(self, feed):
            return (
                [_result(id_="a")],
                [
                    IndexerError(
                        source="Prowlarr",
                        source_type="prowlarr",
                        indexer="BrokenTracker",
                        message="Disabled by Prowlarr after repeated failures",
                    )
                ],
                1,
            )

        monkeypatch.setattr("app.services.feed_poller.FeedService.fetch", fake_fetch)
        _inserted, _updated, errors = await poller.refresh_now(feed_id)
        assert [e.indexer for e in errors] == ["BrokenTracker"]

        async with poller_engine() as session:
            feed = (await session.execute(select(Feed).where(Feed.id == feed_id))).scalar_one()
        assert feed.last_poll_errors == [
            {
                "source": "Prowlarr",
                "message": "Disabled by Prowlarr after repeated failures",
                "source_type": "prowlarr",
                "indexer": "BrokenTracker",
            }
        ]

        # A clean follow-up poll clears the stored errors.
        async def clean_fetch(self, feed):
            return [_result(id_="a")], [], 1

        monkeypatch.setattr("app.services.feed_poller.FeedService.fetch", clean_fetch)
        await poller.refresh_now(feed_id)
        async with poller_engine() as session:
            feed = (await session.execute(select(Feed).where(Feed.id == feed_id))).scalar_one()
        assert feed.last_poll_errors is None


class TestPollerSchedulerIntegration:
    @pytest.mark.asyncio
    async def test_tick_polls_due_feeds_and_skips_recent(self, poller_engine, monkeypatch):
        """Smoke test: a single tick runs ``_poll_one`` for each due feed."""
        due_id = await _make_feed(poller_engine, name="Due")
        recent_id = await _make_feed(poller_engine, name="Recent")
        async with poller_engine() as session:
            recent = (await session.execute(select(Feed).where(Feed.id == recent_id))).scalar_one()
            recent.last_polled_at = datetime.now(UTC)
            await session.commit()

        poller = FeedPoller(poller_engine)
        polled: list[int] = []

        original_poll_one = poller._poll_one

        async def tracking_poll_one(feed_id: int):
            polled.append(feed_id)
            await original_poll_one(feed_id)

        poller._poll_one = tracking_poll_one  # type: ignore[method-assign]

        monkeypatch.setattr(
            "app.services.feed_poller.FeedService.fetch",
            AsyncMock(return_value=([], [], 0)),
        )

        await poller._tick()

        assert due_id in polled
        assert recent_id not in polled
