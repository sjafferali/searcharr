"""
Helpers for recording download history entries.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DownloadHistory, HistoryAction, HistoryStatus

logger = logging.getLogger(__name__)


def format_size(size_bytes: int | None) -> str:
    """Format bytes into a human-readable string. Returns ``""`` when unknown."""
    if size_bytes is None:
        return ""
    if size_bytes == 0:
        return "0 B"

    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    size = float(size_bytes)
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    return f"{size:.1f} {units[unit_index]}"


async def record_history(
    db: AsyncSession,
    *,
    action: HistoryAction,
    title: str,
    source_type: str,
    source_instance_name: str,
    indexer: str,
    status: HistoryStatus = HistoryStatus.SUCCESS,
    size_bytes: int | None = None,
    info_url: str | None = None,
    torrent_url: str | None = None,
    magnet_link: str | None = None,
    source_instance_id: int | None = None,
    client_id: int | None = None,
    client_name: str | None = None,
    search_query: str | None = None,
    error_message: str | None = None,
    commit: bool = True,
) -> DownloadHistory:
    """
    Insert a ``DownloadHistory`` row.

    When ``commit`` is True the surrounding transaction is committed before
    returning. Set it to False when callers manage their own transaction
    boundaries.
    """
    entry = DownloadHistory(
        action=action,
        status=status,
        title=title,
        size_bytes=size_bytes,
        info_url=info_url,
        torrent_url=torrent_url,
        magnet_link=magnet_link,
        source_type=source_type,
        source_instance_id=source_instance_id,
        source_instance_name=source_instance_name,
        indexer=indexer,
        client_id=client_id,
        client_name=client_name,
        search_query=search_query,
        error_message=error_message,
    )
    db.add(entry)
    if commit:
        await db.commit()
        await db.refresh(entry)
    else:
        await db.flush()
    return entry
