"""
API endpoints for download operations.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models import DownloadClient, HistoryAction, HistoryStatus
from app.schemas import DownloadRequest, DownloadResponse
from app.services import QBittorrentService, decrypt_credential, record_history

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/download", tags=["download"])


@router.post("", response_model=DownloadResponse)
async def send_to_client(
    data: DownloadRequest,
    db: AsyncSession = Depends(get_db),
) -> DownloadResponse:
    """
    Send a torrent to a download client and record the action in history.

    Accepts either a magnet link or a torrent URL. The torrent will be
    added to the specified download client.

    Request Body:
    - **client_id**: ID of the download client to use (required)
    - **magnet_link**: Magnet URI (optional, provide either this or torrent_url)
    - **torrent_url**: URL to .torrent file (optional, provide either this or magnet_link)
    - **title**, **source_type**, **source_instance_name**, **indexer**: result
      metadata recorded to history alongside the action.

    Returns success status and message.
    """
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == data.client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    success = False
    message = ""
    error_message: str | None = None

    try:
        username = decrypt_credential(client.username)
        password = decrypt_credential(client.password)

        service = QBittorrentService(client.url, username, password)

        if data.magnet_link:
            success, message = await service.add_torrent_magnet(
                data.magnet_link, category=client.category
            )
        elif data.torrent_url:
            success, message = await service.add_torrent_url(
                data.torrent_url, category=client.category
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Either magnet_link or torrent_url must be provided",
            )

        if not success:
            error_message = message

        await record_history(
            db,
            action=HistoryAction.SENT_TO_CLIENT,
            status=HistoryStatus.SUCCESS if success else HistoryStatus.FAILED,
            title=data.title,
            size_bytes=data.size_bytes,
            info_url=data.info_url,
            torrent_url=data.torrent_url,
            magnet_link=data.magnet_link,
            source_type=data.source_type,
            source_instance_id=data.source_instance_id,
            source_instance_name=data.source_instance_name,
            indexer=data.indexer,
            client_id=client.id,
            client_name=client.name,
            search_query=data.search_query,
            error_message=error_message,
        )

        if not success:
            raise HTTPException(status_code=400, detail=message)

        return DownloadResponse(
            success=True,
            message=message,
            client_name=client.name,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error sending torrent to client {client.name}")
        try:
            await record_history(
                db,
                action=HistoryAction.SENT_TO_CLIENT,
                status=HistoryStatus.FAILED,
                title=data.title,
                size_bytes=data.size_bytes,
                info_url=data.info_url,
                torrent_url=data.torrent_url,
                magnet_link=data.magnet_link,
                source_type=data.source_type,
                source_instance_id=data.source_instance_id,
                source_instance_name=data.source_instance_name,
                indexer=data.indexer,
                client_id=client.id,
                client_name=client.name,
                search_query=data.search_query,
                error_message=str(e),
            )
        except Exception:
            logger.exception("Failed to record history entry for failed download")

        raise HTTPException(
            status_code=500,
            detail=f"Failed to add torrent: {str(e)}",
        ) from e
