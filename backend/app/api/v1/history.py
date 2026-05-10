"""
API endpoints for download history.
"""

import logging
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models import DownloadHistory
from app.schemas import (
    HistoryAction,
    HistoryEntryCreate,
    HistoryEntryResponse,
    HistoryListResponse,
    HistoryLookupRequest,
    HistoryLookupResponse,
    HistoryMatch,
    HistoryMatchEntry,
    HistorySortBy,
    HistoryStatus,
)
from app.services import format_size, record_history

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/history", tags=["history"])


SORT_COLUMNS = {
    HistorySortBy.OCCURRED_AT: DownloadHistory.occurred_at,
    HistorySortBy.TITLE: DownloadHistory.title,
    HistorySortBy.SIZE_BYTES: DownloadHistory.size_bytes,
}


def _serialize(entry: DownloadHistory) -> HistoryEntryResponse:
    return HistoryEntryResponse(
        id=entry.id,
        occurred_at=entry.occurred_at,
        action=HistoryAction(entry.action.value),
        status=HistoryStatus(entry.status.value),
        title=entry.title,
        size_bytes=entry.size_bytes,
        size_formatted=format_size(entry.size_bytes),
        info_url=entry.info_url,
        torrent_url=entry.torrent_url,
        magnet_link=entry.magnet_link,
        source_type=entry.source_type,
        source_instance_id=entry.source_instance_id,
        source_instance_name=entry.source_instance_name,
        indexer=entry.indexer,
        client_id=entry.client_id,
        client_name=entry.client_name,
        search_query=entry.search_query,
        error_message=entry.error_message,
    )


@router.post(
    "",
    response_model=HistoryEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_history_entry(
    data: HistoryEntryCreate,
    db: AsyncSession = Depends(get_db),
) -> HistoryEntryResponse:
    """
    Record a client-side download action (currently only direct .torrent
    downloads). Send-to-client events are recorded automatically by the
    download endpoint and should not also call this endpoint.
    """
    from app.models import HistoryAction as ModelAction

    entry = await record_history(
        db,
        action=ModelAction(data.action.value),
        title=data.title,
        size_bytes=data.size_bytes,
        info_url=data.info_url,
        torrent_url=data.torrent_url,
        magnet_link=data.magnet_link,
        source_type=data.source_type,
        source_instance_id=data.source_instance_id,
        source_instance_name=data.source_instance_name,
        indexer=data.indexer,
        search_query=data.search_query,
    )
    return _serialize(entry)


@router.get("", response_model=HistoryListResponse)
async def list_history(
    q: Annotated[
        str | None,
        Query(description="Substring match against title or search_query"),
    ] = None,
    action: Annotated[
        HistoryAction | None,
        Query(description="Filter by action type"),
    ] = None,
    source_type: Annotated[
        Literal["jackett", "prowlarr"] | None,
        Query(description="Filter by source type"),
    ] = None,
    source_instance_id: Annotated[
        int | None,
        Query(description="Filter by source instance ID"),
    ] = None,
    indexer: Annotated[
        str | None,
        Query(description="Filter by indexer name (exact match)"),
    ] = None,
    client_id: Annotated[
        int | None,
        Query(description="Filter by destination client ID"),
    ] = None,
    history_status: Annotated[
        HistoryStatus | None,
        Query(alias="status", description="Filter by status"),
    ] = None,
    since: Annotated[
        datetime | None,
        Query(description="Only include entries on or after this timestamp"),
    ] = None,
    until: Annotated[
        datetime | None,
        Query(description="Only include entries on or before this timestamp"),
    ] = None,
    min_size_bytes: Annotated[
        int | None,
        Query(ge=0, description="Only include entries at least this large (bytes)"),
    ] = None,
    max_size_bytes: Annotated[
        int | None,
        Query(ge=0, description="Only include entries at most this large (bytes)"),
    ] = None,
    sort_by: Annotated[
        HistorySortBy,
        Query(description="Sort field"),
    ] = HistorySortBy.OCCURRED_AT,
    sort_order: Annotated[
        Literal["asc", "desc"],
        Query(description="Sort order"),
    ] = "desc",
    limit: Annotated[
        int,
        Query(ge=1, le=200, description="Page size"),
    ] = 50,
    offset: Annotated[
        int,
        Query(ge=0, description="Number of rows to skip"),
    ] = 0,
    db: AsyncSession = Depends(get_db),
) -> HistoryListResponse:
    """
    List download history entries with filtering, sorting, and pagination.
    """
    base = select(DownloadHistory)
    count_query = select(func.count()).select_from(DownloadHistory)

    conditions = []
    if q:
        like = f"%{q.lower()}%"
        conditions.append(
            or_(
                func.lower(DownloadHistory.title).like(like),
                func.lower(func.coalesce(DownloadHistory.search_query, "")).like(like),
            )
        )
    if action is not None:
        from app.models import HistoryAction as ModelAction

        conditions.append(DownloadHistory.action == ModelAction(action.value))
    if source_type:
        conditions.append(DownloadHistory.source_type == source_type)
    if source_instance_id is not None:
        conditions.append(DownloadHistory.source_instance_id == source_instance_id)
    if indexer:
        conditions.append(DownloadHistory.indexer == indexer)
    if client_id is not None:
        conditions.append(DownloadHistory.client_id == client_id)
    if history_status is not None:
        from app.models import HistoryStatus as ModelStatus

        conditions.append(DownloadHistory.status == ModelStatus(history_status.value))
    if since is not None:
        conditions.append(DownloadHistory.occurred_at >= since)
    if until is not None:
        conditions.append(DownloadHistory.occurred_at <= until)
    if min_size_bytes is not None:
        conditions.append(DownloadHistory.size_bytes >= min_size_bytes)
    if max_size_bytes is not None:
        conditions.append(DownloadHistory.size_bytes <= max_size_bytes)

    for cond in conditions:
        base = base.where(cond)
        count_query = count_query.where(cond)

    sort_column = SORT_COLUMNS[sort_by]
    base = base.order_by(desc(sort_column) if sort_order == "desc" else sort_column.asc())
    base = base.limit(limit).offset(offset)

    rows_result = await db.execute(base)
    entries = rows_result.scalars().all()

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    return HistoryListResponse(
        total=total,
        limit=limit,
        offset=offset,
        entries=[_serialize(e) for e in entries],
    )


@router.post("/lookup", response_model=HistoryLookupResponse)
async def lookup_history(
    data: HistoryLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> HistoryLookupResponse:
    """
    Find prior history entries for a batch of search results.

    For each input item, returns matching rows where either:

    * ``info_url`` is set on both sides and they're equal, OR
    * ``title`` matches AND ``size_bytes`` matches (when size is known).

    Items without any match are omitted from the response.
    """
    if not data.items:
        return HistoryLookupResponse(matches=[])

    titles = {item.title for item in data.items}
    info_urls = {item.info_url for item in data.items if item.info_url}

    candidates = [DownloadHistory.title.in_(titles)]
    if info_urls:
        candidates.append(DownloadHistory.info_url.in_(info_urls))

    query = (
        select(DownloadHistory).where(or_(*candidates)).order_by(desc(DownloadHistory.occurred_at))
    )
    rows = (await db.execute(query)).scalars().all()

    matches: list[HistoryMatch] = []
    for index, item in enumerate(data.items):
        item_rows: list[DownloadHistory] = []
        for row in rows:
            if item.info_url and row.info_url == item.info_url:
                item_rows.append(row)
                continue
            if (
                item.size_bytes is not None
                and row.size_bytes is not None
                and row.title == item.title
                and row.size_bytes == item.size_bytes
            ):
                item_rows.append(row)

        if not item_rows:
            continue

        matches.append(
            HistoryMatch(
                index=index,
                count=len(item_rows),
                last_occurred_at=item_rows[0].occurred_at,
                entries=[
                    HistoryMatchEntry(
                        id=row.id,
                        occurred_at=row.occurred_at,
                        action=HistoryAction(row.action.value),
                        status=HistoryStatus(row.status.value),
                        client_name=row.client_name,
                    )
                    for row in item_rows[:10]
                ],
            )
        )

    return HistoryLookupResponse(matches=matches)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_history_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a single history entry."""
    result = await db.execute(select(DownloadHistory).where(DownloadHistory.id == entry_id))
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")

    await db.delete(entry)
    await db.commit()
