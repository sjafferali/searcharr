"""
API endpoints for bookmarks.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Bookmark
from app.schemas import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkLookupRequest,
    BookmarkLookupResponse,
    BookmarkResponse,
    BookmarkSortBy,
    SortOrder,
)
from app.services import compute_dedup_key, format_size

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


SORT_COLUMNS = {
    BookmarkSortBy.CREATED_AT: Bookmark.created_at,
    BookmarkSortBy.TITLE: Bookmark.title,
    BookmarkSortBy.SIZE_BYTES: Bookmark.size_bytes,
}


def _serialize(b: Bookmark) -> BookmarkResponse:
    return BookmarkResponse(
        id=b.id,
        created_at=b.created_at,
        title=b.title,
        size_bytes=b.size_bytes,
        size_formatted=format_size(b.size_bytes),
        info_url=b.info_url,
        torrent_url=b.torrent_url,
        magnet_link=b.magnet_link,
        source_type=b.source_type,
        source_instance_id=b.source_instance_id,
        source_instance_name=b.source_instance_name,
        indexer=b.indexer,
        category=b.category,
        notes=b.notes,
        dedup_key=b.dedup_key,
    )


@router.get("", response_model=BookmarkListResponse)
async def list_bookmarks(
    sort_by: Annotated[BookmarkSortBy, Query()] = BookmarkSortBy.CREATED_AT,
    sort_order: Annotated[SortOrder, Query()] = SortOrder.DESC,
    db: AsyncSession = Depends(get_db),
) -> BookmarkListResponse:
    """List all bookmarks."""
    sort_column = SORT_COLUMNS[sort_by]
    order_clause = desc(sort_column) if sort_order == SortOrder.DESC else sort_column

    total_result = await db.execute(select(func.count(Bookmark.id)))
    total = total_result.scalar_one()

    rows_result = await db.execute(select(Bookmark).order_by(order_clause))
    rows = list(rows_result.scalars().all())

    return BookmarkListResponse(
        total=total,
        entries=[_serialize(b) for b in rows],
    )


@router.post("", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    payload: BookmarkCreate,
    db: AsyncSession = Depends(get_db),
) -> BookmarkResponse:
    """
    Save a search result as a bookmark.

    Idempotent: if a bookmark with the same dedup_key already exists, the
    existing one is returned with a 200-equivalent body (still 201 for
    consistency — clients should treat both as success).
    """
    dedup_key = compute_dedup_key(
        magnet_link=payload.magnet_link,
        torrent_url=payload.torrent_url,
        info_url=payload.info_url,
        source=payload.source_instance_name,
        indexer=payload.indexer,
        title=payload.title,
        size=payload.size_bytes,
    )
    if not dedup_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot derive a stable identity for this result.",
        )

    existing_result = await db.execute(select(Bookmark).where(Bookmark.dedup_key == dedup_key))
    existing = existing_result.scalar_one_or_none()
    if existing:
        return _serialize(existing)

    bookmark = Bookmark(
        title=payload.title,
        size_bytes=payload.size_bytes,
        info_url=payload.info_url,
        torrent_url=payload.torrent_url,
        magnet_link=payload.magnet_link,
        source_type=payload.source_type,
        source_instance_id=payload.source_instance_id,
        source_instance_name=payload.source_instance_name,
        indexer=payload.indexer,
        category=payload.category,
        notes=payload.notes,
        dedup_key=dedup_key,
    )
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return _serialize(bookmark)


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    bookmark_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a bookmark by id."""
    result = await db.execute(select(Bookmark).where(Bookmark.id == bookmark_id))
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    await db.delete(bookmark)
    await db.commit()


@router.delete("/by-key/{dedup_key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark_by_key(
    dedup_key: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a bookmark by its dedup_key.

    Convenient when the client only knows the result identity (e.g.
    toggling a bookmark off from the search results page).
    """
    result = await db.execute(select(Bookmark).where(Bookmark.dedup_key == dedup_key))
    bookmark = result.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    await db.delete(bookmark)
    await db.commit()


@router.post("/lookup", response_model=BookmarkLookupResponse)
async def lookup_bookmarks(
    payload: BookmarkLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> BookmarkLookupResponse:
    """
    Given a batch of search results, return which ones are already bookmarked.

    The server computes each item's dedup_key and queries the index.
    """
    keys: list[str] = []
    for item in payload.items:
        key = compute_dedup_key(
            magnet_link=item.magnet_link,
            torrent_url=item.torrent_url,
            info_url=item.info_url,
            source=item.source_instance_name,
            indexer=item.indexer,
            title=item.title,
            size=item.size_bytes,
        )
        if key:
            keys.append(key)

    if not keys:
        return BookmarkLookupResponse(matches={})

    rows_result = await db.execute(
        select(Bookmark.id, Bookmark.dedup_key).where(Bookmark.dedup_key.in_(keys))
    )
    matches = {key: bid for (bid, key) in rows_result.all()}
    return BookmarkLookupResponse(matches=matches)
