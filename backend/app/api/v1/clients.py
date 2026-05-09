"""
API endpoints for managing download clients.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models import DownloadClient
from app.schemas import (
    DownloadClientCreate,
    DownloadClientResponse,
    DownloadClientUpdate,
    DownloadClientWithStatus,
    TestConnectionResponse,
)
from app.services import QBittorrentService, decrypt_credential, encrypt_credential

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clients", tags=["clients"])


# =============================================================================
# Helper Functions
# =============================================================================


async def _clear_default_flag(db: AsyncSession, exclude_id: int | None = None) -> None:
    """Unset the default flag on every client, optionally excluding one."""
    stmt = update(DownloadClient).values(is_default=False)
    if exclude_id is not None:
        stmt = stmt.where(DownloadClient.id != exclude_id)
    await db.execute(stmt)


async def get_client_status(client: DownloadClient) -> str:
    """
    Get the online/offline status for a download client.

    Returns:
        "online" or "offline"
    """
    try:
        username = decrypt_credential(client.username)
        password = decrypt_credential(client.password)

        # Currently only qBittorrent is supported
        service = QBittorrentService(client.url, username, password)
        success, _ = await service.test_connection()
        return "online" if success else "offline"
    except Exception as e:
        logger.warning(f"Error checking status for client {client.name}: {e}")
        return "offline"


# =============================================================================
# Download Client Endpoints
# =============================================================================


@router.get("", response_model=list[DownloadClientResponse])
async def list_clients(
    db: AsyncSession = Depends(get_db),
) -> list[DownloadClientResponse]:
    """List all download clients."""
    result = await db.execute(select(DownloadClient))
    clients = result.scalars().all()

    return [
        DownloadClientResponse(
            id=client.id,
            name=client.name,
            client_type=client.client_type,
            url=client.url,
            category=client.category,
            is_default=client.is_default,
            created_at=client.created_at,
            updated_at=client.updated_at,
        )
        for client in clients
    ]


@router.post("", response_model=DownloadClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: DownloadClientCreate,
    db: AsyncSession = Depends(get_db),
) -> DownloadClientResponse:
    """Create a new download client."""
    # Encrypt credentials before storing
    encrypted_username = encrypt_credential(data.username)
    encrypted_password = encrypt_credential(data.password)

    if data.is_default:
        await _clear_default_flag(db)

    client = DownloadClient(
        name=data.name,
        client_type=data.client_type,
        url=data.url.rstrip("/"),
        username=encrypted_username,
        password=encrypted_password,
        category=data.category,
        is_default=data.is_default,
    )

    db.add(client)
    await db.commit()
    await db.refresh(client)

    return DownloadClientResponse(
        id=client.id,
        name=client.name,
        client_type=client.client_type,
        url=client.url,
        category=client.category,
        is_default=client.is_default,
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


@router.get("/{client_id}", response_model=DownloadClientResponse)
async def get_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
) -> DownloadClientResponse:
    """Get a specific download client."""
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    return DownloadClientResponse(
        id=client.id,
        name=client.name,
        client_type=client.client_type,
        url=client.url,
        category=client.category,
        is_default=client.is_default,
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


@router.put("/{client_id}", response_model=DownloadClientResponse)
async def update_client(
    client_id: int,
    data: DownloadClientUpdate,
    db: AsyncSession = Depends(get_db),
) -> DownloadClientResponse:
    """Update a download client."""
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    update_fields = data.model_dump(exclude_unset=True)
    if "name" in update_fields:
        client.name = update_fields["name"]
    if "client_type" in update_fields:
        client.client_type = update_fields["client_type"]
    if "url" in update_fields:
        client.url = update_fields["url"].rstrip("/")
    if "username" in update_fields:
        client.username = encrypt_credential(update_fields["username"])
    if "password" in update_fields:
        client.password = encrypt_credential(update_fields["password"])
    if "category" in update_fields:
        client.category = update_fields["category"]
    if "is_default" in update_fields:
        new_default = bool(update_fields["is_default"])
        if new_default:
            await _clear_default_flag(db, exclude_id=client.id)
        client.is_default = new_default

    await db.commit()
    await db.refresh(client)

    return DownloadClientResponse(
        id=client.id,
        name=client.name,
        client_type=client.client_type,
        url=client.url,
        category=client.category,
        is_default=client.is_default,
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a download client."""
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    await db.delete(client)
    await db.commit()


@router.post("/{client_id}/test", response_model=TestConnectionResponse)
async def test_client(
    client_id: int,
    db: AsyncSession = Depends(get_db),
) -> TestConnectionResponse:
    """Test connection to a download client."""
    result = await db.execute(select(DownloadClient).where(DownloadClient.id == client_id))
    client = result.scalar_one_or_none()

    if not client:
        raise HTTPException(status_code=404, detail="Download client not found")

    try:
        username = decrypt_credential(client.username)
        password = decrypt_credential(client.password)

        # Currently only qBittorrent is supported
        service = QBittorrentService(client.url, username, password)
        success, message = await service.test_connection()

        return TestConnectionResponse(
            success=success,
            message=message,
            indexer_count=None,
        )
    except Exception as e:
        logger.exception(f"Error testing client {client.name}")
        return TestConnectionResponse(
            success=False,
            message=f"Error: {str(e)}",
            indexer_count=None,
        )


@router.get("/status/all", response_model=list[DownloadClientWithStatus])
async def get_all_clients_status(
    db: AsyncSession = Depends(get_db),
) -> list[DownloadClientWithStatus]:
    """
    Get all download clients with their online/offline status.
    """
    result = await db.execute(select(DownloadClient))
    clients = result.scalars().all()

    clients_with_status: list[DownloadClientWithStatus] = []

    for client in clients:
        status = await get_client_status(client)
        clients_with_status.append(
            DownloadClientWithStatus(
                id=client.id,
                name=client.name,
                client_type=client.client_type,
                url=client.url,
                category=client.category,
                is_default=client.is_default,
                created_at=client.created_at,
                updated_at=client.updated_at,
                status=status,
            )
        )

    return clients_with_status
