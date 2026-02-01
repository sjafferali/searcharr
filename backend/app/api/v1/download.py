"""
API endpoints for download operations.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models import DownloadClient
from app.schemas import DownloadRequest, DownloadResponse
from app.services import QBittorrentService, decrypt_credential

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/download", tags=["download"])


@router.post("", response_model=DownloadResponse)
async def send_to_client(
    data: DownloadRequest,
    db: AsyncSession = Depends(get_db),
) -> DownloadResponse:
    """
    Send a torrent to a download client.

    Accepts either a magnet link or a torrent URL. The torrent will be
    added to the specified download client.

    Request Body:
    - **client_id**: ID of the download client to use (required)
    - **magnet_link**: Magnet URI (optional, provide either this or torrent_url)
    - **torrent_url**: URL to .torrent file (optional, provide either this or magnet_link)

    Returns success status and message.
    """
    # Get the download client
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == data.client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    try:
        username = decrypt_credential(client.username)
        password = decrypt_credential(client.password)

        # Currently only qBittorrent is supported
        service = QBittorrentService(client.url, username, password)

        if data.magnet_link:
            # Add via magnet link
            success, message = await service.add_torrent_magnet(data.magnet_link)
        elif data.torrent_url:
            # Add via torrent URL
            success, message = await service.add_torrent_url(data.torrent_url)
        else:
            # This shouldn't happen due to schema validation, but handle it anyway
            raise HTTPException(
                status_code=400,
                detail="Either magnet_link or torrent_url must be provided",
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add torrent: {str(e)}",
        ) from e
