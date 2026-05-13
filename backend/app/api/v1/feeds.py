"""
API endpoints for saved feeds.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models import Feed, FeedIndexer, FeedItem
from app.schemas import (
    FeedCreate,
    FeedFetchResponse,
    FeedFilters,
    FeedIndexerRef,
    FeedItemListResponse,
    FeedItemSortBy,
    FeedListResponse,
    FeedResponse,
    FeedSortStrategy,
    FeedUpdate,
    IndexerError,
)
from app.schemas import (
    FeedItem as FeedItemSchema,
)
from app.schemas.search import SearchCategory, SortOrder
from app.services import FeedPoller, FeedService, format_size

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feeds", tags=["feeds"])


def _poll_errors(feed: Feed) -> list[IndexerError]:
    """Decode the feed's stored ``last_poll_errors`` JSON into schema objects."""
    raw = feed.last_poll_errors or []
    decoded: list[IndexerError] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        try:
            decoded.append(IndexerError(**entry))
        except Exception:
            logger.debug("Skipping malformed feed poll error entry: %r", entry)
    return decoded


def _serialize(feed: Feed) -> FeedResponse:
    return FeedResponse(
        id=feed.id,
        name=feed.name,
        description=feed.description,
        sort_strategy=FeedSortStrategy(feed.sort_strategy),
        filters=FeedFilters(
            category=SearchCategory(feed.category),
            freeleech_only=feed.freeleech_only,
            min_seeders=feed.min_seeders,
            min_size_bytes=feed.min_size_bytes,
            max_size_bytes=feed.max_size_bytes,
            include_regex=feed.include_regex,
            exclude_regex=feed.exclude_regex,
        ),
        indexers=[
            FeedIndexerRef(
                source_type=fi.source_type,  # type: ignore[arg-type]
                source_instance_id=fi.source_instance_id,
                source_instance_name=fi.source_instance_name,
                indexer_id=fi.indexer_id,
                indexer_name=fi.indexer_name,
            )
            for fi in feed.indexers
        ],
        poll_interval_minutes=feed.poll_interval_minutes,
        retention_days=feed.retention_days,
        polling_enabled=feed.polling_enabled,
        last_polled_at=feed.last_polled_at,
        last_poll_errors=_poll_errors(feed),
        stale_after_seconds=feed.stale_after_seconds,
        created_at=feed.created_at,
        updated_at=feed.updated_at,
    )


def _apply_filters_to_feed(feed: Feed, filters: FeedFilters) -> None:
    feed.category = filters.category.value
    feed.freeleech_only = filters.freeleech_only
    feed.min_seeders = filters.min_seeders
    feed.min_size_bytes = filters.min_size_bytes
    feed.max_size_bytes = filters.max_size_bytes
    feed.include_regex = filters.include_regex
    feed.exclude_regex = filters.exclude_regex


def _replace_indexers(feed: Feed, refs: list[FeedIndexerRef]) -> None:
    """
    Reconcile a feed's indexer collection with the requested set.

    Drops rows whose (source_type, source_instance_id, indexer_id) is not in
    the new set, refreshes the display names on rows that remain, and
    appends rows for newly added refs. Rebuilding the list with fresh
    objects would otherwise hit the (feed_id, source_type, source_instance_id,
    indexer_id) unique constraint when the user saves an unchanged or
    partially-overlapping selection — SQLAlchemy emits the new INSERTs
    before the corresponding DELETEs.
    """
    new_keys = {(ref.source_type, ref.source_instance_id, ref.indexer_id) for ref in refs}
    existing_by_key: dict[tuple[str, int, str], FeedIndexer] = {
        (fi.source_type, fi.source_instance_id, fi.indexer_id): fi for fi in feed.indexers
    }

    for stale_key, stale_entry in list(existing_by_key.items()):
        if stale_key not in new_keys:
            feed.indexers.remove(stale_entry)

    for ref in refs:
        key = (ref.source_type, ref.source_instance_id, ref.indexer_id)
        existing_entry = existing_by_key.get(key)
        if existing_entry is not None:
            existing_entry.source_instance_name = ref.source_instance_name
            existing_entry.indexer_name = ref.indexer_name
        else:
            feed.indexers.append(
                FeedIndexer(
                    source_type=ref.source_type,
                    source_instance_id=ref.source_instance_id,
                    source_instance_name=ref.source_instance_name,
                    indexer_id=ref.indexer_id,
                    indexer_name=ref.indexer_name,
                )
            )


async def _load_feed(feed_id: int, db: AsyncSession) -> Feed:
    result = await db.execute(
        select(Feed).where(Feed.id == feed_id).options(selectinload(Feed.indexers))
    )
    feed = result.scalar_one_or_none()
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return feed


@router.get("", response_model=FeedListResponse)
async def list_feeds(db: AsyncSession = Depends(get_db)) -> FeedListResponse:
    """List all saved feeds."""
    result = await db.execute(
        select(Feed).options(selectinload(Feed.indexers)).order_by(Feed.name.asc())
    )
    feeds = list(result.scalars().all())
    return FeedListResponse(total=len(feeds), entries=[_serialize(f) for f in feeds])


@router.post("", response_model=FeedResponse, status_code=status.HTTP_201_CREATED)
async def create_feed(payload: FeedCreate, db: AsyncSession = Depends(get_db)) -> FeedResponse:
    """Create a new saved feed."""
    feed = Feed(
        name=payload.name.strip(),
        description=payload.description,
        sort_strategy=payload.sort_strategy.value,
        poll_interval_minutes=payload.poll_interval_minutes,
        retention_days=payload.retention_days,
        polling_enabled=payload.polling_enabled,
    )
    _apply_filters_to_feed(feed, payload.filters)
    _replace_indexers(feed, payload.indexers)
    db.add(feed)
    await db.commit()
    return _serialize(await _load_feed(feed.id, db))


@router.get("/{feed_id}", response_model=FeedResponse)
async def get_feed(feed_id: int, db: AsyncSession = Depends(get_db)) -> FeedResponse:
    """Get a single feed by id."""
    feed = await _load_feed(feed_id, db)
    return _serialize(feed)


@router.put("/{feed_id}", response_model=FeedResponse)
async def update_feed(
    feed_id: int,
    payload: FeedUpdate,
    db: AsyncSession = Depends(get_db),
) -> FeedResponse:
    """Update an existing feed. Omitted fields are left unchanged."""
    feed = await _load_feed(feed_id, db)

    if payload.name is not None:
        feed.name = payload.name.strip()
    if payload.description is not None:
        feed.description = payload.description
    if payload.sort_strategy is not None:
        feed.sort_strategy = payload.sort_strategy.value
    if payload.filters is not None:
        _apply_filters_to_feed(feed, payload.filters)
    if payload.poll_interval_minutes is not None:
        feed.poll_interval_minutes = payload.poll_interval_minutes
    if payload.retention_days is not None:
        feed.retention_days = payload.retention_days
    if payload.polling_enabled is not None:
        feed.polling_enabled = payload.polling_enabled
    if payload.indexers is not None:
        _replace_indexers(feed, payload.indexers)

    await db.commit()
    return _serialize(await _load_feed(feed.id, db))


@router.delete("/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feed(feed_id: int, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a feed."""
    feed = await _load_feed(feed_id, db)
    await db.delete(feed)
    await db.commit()


_SORT_COLUMNS: dict[FeedItemSortBy, object] = {
    FeedItemSortBy.LAST_SEEN: FeedItem.last_seen_at,
    FeedItemSortBy.FIRST_SEEN: FeedItem.first_seen_at,
    FeedItemSortBy.PUB_DATE: FeedItem.pub_date,
    FeedItemSortBy.SEEDERS: FeedItem.seeders,
    FeedItemSortBy.SIZE: FeedItem.size_bytes,
    FeedItemSortBy.TITLE: FeedItem.title,
}


def _serialize_item(row: FeedItem) -> FeedItemSchema:
    return FeedItemSchema(
        id=row.dedup_key,
        item_id=row.id,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        title=row.title,
        source=row.source_instance_name,
        source_type=row.source_type,  # type: ignore[arg-type]
        indexer=row.indexer,
        size=row.size_bytes,
        size_formatted=format_size(row.size_bytes),
        seeders=row.seeders,
        leechers=row.leechers,
        date=row.pub_date,
        category=row.category or "",
        magnet_link=row.magnet_link,
        torrent_url=row.torrent_url,
        info_url=row.info_url,
        freeleech=row.freeleech,
        download_volume_factor=row.download_volume_factor,
        dedup_key=row.dedup_key,
    )


@router.get("/{feed_id}/items", response_model=FeedItemListResponse)
async def list_feed_items(
    feed_id: int,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort_by: Annotated[FeedItemSortBy, Query()] = FeedItemSortBy.LAST_SEEN,
    sort_order: Annotated[SortOrder, Query()] = SortOrder.DESC,
    freeleech_only: Annotated[bool, Query()] = False,
    min_seeders: Annotated[int, Query(ge=0)] = 0,
    min_size_bytes: Annotated[int | None, Query(ge=0)] = None,
    max_size_bytes: Annotated[int | None, Query(ge=0)] = None,
    seen_within_hours: Annotated[int | None, Query(ge=1)] = None,
    first_seen_within_hours: Annotated[int | None, Query(ge=1)] = None,
    first_seen_after: Annotated[datetime | None, Query()] = None,
    db: AsyncSession = Depends(get_db),
) -> FeedItemListResponse:
    """List persisted items for a feed, with pagination and filtering."""
    feed = await _load_feed(feed_id, db)

    base = select(FeedItem).where(FeedItem.feed_id == feed_id)

    if freeleech_only:
        base = base.where(FeedItem.freeleech.is_(True))
    if min_seeders > 0:
        base = base.where(FeedItem.seeders >= min_seeders)
    if min_size_bytes is not None:
        base = base.where(FeedItem.size_bytes >= min_size_bytes)
    if max_size_bytes is not None:
        base = base.where(FeedItem.size_bytes <= max_size_bytes)
    now = datetime.now(UTC)
    if seen_within_hours is not None:
        cutoff = now - timedelta(hours=seen_within_hours)
        base = base.where(FeedItem.last_seen_at >= cutoff)
    if first_seen_within_hours is not None:
        cutoff = now - timedelta(hours=first_seen_within_hours)
        base = base.where(FeedItem.first_seen_at >= cutoff)
    if first_seen_after is not None:
        if first_seen_after.tzinfo is None:
            first_seen_after = first_seen_after.replace(tzinfo=UTC)
        base = base.where(FeedItem.first_seen_at > first_seen_after)

    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar_one()

    sort_col = _SORT_COLUMNS[sort_by]
    ordered = sort_col.asc() if sort_order == SortOrder.ASC else sort_col.desc()  # type: ignore[attr-defined]
    # Stable tiebreaker by id keeps pagination deterministic when many rows
    # share the same sort-key value (e.g. several items first seen the same
    # second on initial poll).
    rows_q = base.order_by(ordered, FeedItem.id.desc()).limit(limit).offset(offset)
    rows = (await db.execute(rows_q)).scalars().all()

    next_poll_at: datetime | None = None
    if feed.polling_enabled and feed.last_polled_at is not None:
        last_polled = feed.last_polled_at
        if last_polled.tzinfo is None:
            last_polled = last_polled.replace(tzinfo=UTC)
        next_poll_at = last_polled + timedelta(minutes=feed.poll_interval_minutes)

    return FeedItemListResponse(
        total=total,
        entries=[_serialize_item(r) for r in rows],
        feed_id=feed.id,
        feed_name=feed.name,
        last_polled_at=feed.last_polled_at,
        next_poll_at=next_poll_at,
        stale_after_seconds=feed.stale_after_seconds,
        polling_enabled=feed.polling_enabled,
        source_errors=_poll_errors(feed),
    )


async def _refresh_and_list(
    feed_id: int,
    request: Request,
    db: AsyncSession,
) -> FeedItemListResponse:
    poller: FeedPoller | None = getattr(request.app.state, "feed_poller", None)
    if poller is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Feed poller is not running",
        )
    inserted, updated, errors = await poller.refresh_now(feed_id)
    if errors and inserted == 0 and updated == 0:
        # Surface a 404 when the poller couldn't find the feed; other errors
        # are non-fatal (source-level failures) and we still return the list.
        if any("not found" in e.message.lower() for e in errors):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return await list_feed_items(feed_id, db=db)


@router.post("/{feed_id}/refresh", response_model=FeedItemListResponse)
async def refresh_feed(
    feed_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> FeedItemListResponse:
    """Force a synchronous poll for this feed and return the updated item list."""
    return await _refresh_and_list(feed_id, request, db)


@router.post("/{feed_id}/fetch", response_model=FeedFetchResponse)
async def fetch_feed(feed_id: int, db: AsyncSession = Depends(get_db)) -> FeedFetchResponse:
    """
    Fetch the latest releases for a feed and return them after applying the
    feed's filters.

    Stateless backward-compat path: returns the live ``SearchResult`` list
    without touching persisted history. Callers that want the polled history
    plus a fresh poll should use ``POST /feeds/{id}/refresh`` instead.
    """
    feed = await _load_feed(feed_id, db)
    service = FeedService(db)
    results, errors, sources_queried = await service.fetch(feed)

    return FeedFetchResponse(
        feed_id=feed.id,
        feed_name=feed.name,
        fetched_at=datetime.now(UTC),
        total_results=len(results),
        results=results,
        sources_queried=sources_queried,
        errors=errors,
    )
