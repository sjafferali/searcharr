"""
API endpoints for saved feeds.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models import Feed, FeedIndexer
from app.schemas import (
    FeedCreate,
    FeedFetchResponse,
    FeedFilters,
    FeedIndexerRef,
    FeedListResponse,
    FeedResponse,
    FeedUpdate,
)
from app.schemas.search import SearchCategory
from app.services import FeedService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feeds", tags=["feeds"])


def _serialize(feed: Feed) -> FeedResponse:
    return FeedResponse(
        id=feed.id,
        name=feed.name,
        description=feed.description,
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
    feed = Feed(name=payload.name.strip(), description=payload.description)
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
    if payload.filters is not None:
        _apply_filters_to_feed(feed, payload.filters)
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


@router.post("/{feed_id}/fetch", response_model=FeedFetchResponse)
async def fetch_feed(feed_id: int, db: AsyncSession = Depends(get_db)) -> FeedFetchResponse:
    """
    Fetch the latest releases for a feed and return them after applying the
    feed's filters.
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
