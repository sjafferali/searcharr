"""
API endpoints for managing Jackett and Prowlarr instances.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models import JackettInstance, ProwlarrInstance
from app.schemas import (
    AllInstancesStatus,
    JackettInstanceCreate,
    JackettInstanceResponse,
    JackettInstanceUpdate,
    JackettInstanceWithStatus,
    ProwlarrInstanceCreate,
    ProwlarrInstanceResponse,
    ProwlarrInstanceUpdate,
    ProwlarrInstanceWithStatus,
    TestConnectionResponse,
)
from app.services import JackettService, ProwlarrService, decrypt_credential, encrypt_credential

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/instances", tags=["instances"])


# =============================================================================
# Helper Functions
# =============================================================================


def mask_api_key(api_key: str) -> str:
    """Mask API key for safe display."""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return api_key[:4] + "..." + api_key[-4:]


async def get_instance_status(
    instance: JackettInstance | ProwlarrInstance,
    instance_type: str,
) -> tuple[str, int | None]:
    """
    Get the online/offline status and indexer count for an instance.

    Returns:
        Tuple of (status, indexer_count)
    """
    try:
        api_key = decrypt_credential(instance.api_key)

        if instance_type == "jackett":
            jackett_service = JackettService(instance.url, api_key)
            success, _, indexer_count = await jackett_service.test_connection()
        else:
            prowlarr_service = ProwlarrService(instance.url, api_key)
            success, _, indexer_count = await prowlarr_service.test_connection()

        return "online" if success else "offline", indexer_count
    except Exception as e:
        logger.warning(f"Error checking status for {instance.name}: {e}")
        return "offline", None


# =============================================================================
# Jackett Instance Endpoints
# =============================================================================


@router.get("/jackett", response_model=list[JackettInstanceResponse])
async def list_jackett_instances(
    db: AsyncSession = Depends(get_db),
) -> list[JackettInstanceResponse]:
    """List all Jackett instances."""
    result = await db.execute(select(JackettInstance))
    instances = result.scalars().all()

    return [
        JackettInstanceResponse(
            id=instance.id,
            name=instance.name,
            url=instance.url,
            api_key=mask_api_key(decrypt_credential(instance.api_key)),
            created_at=instance.created_at,
            updated_at=instance.updated_at,
        )
        for instance in instances
    ]


@router.post(
    "/jackett", response_model=JackettInstanceResponse, status_code=status.HTTP_201_CREATED
)
async def create_jackett_instance(
    data: JackettInstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> JackettInstanceResponse:
    """Create a new Jackett instance."""
    # Encrypt the API key before storing
    encrypted_api_key = encrypt_credential(data.api_key)

    instance = JackettInstance(
        name=data.name,
        url=data.url.rstrip("/"),
        api_key=encrypted_api_key,
    )

    db.add(instance)
    await db.commit()
    await db.refresh(instance)

    return JackettInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(data.api_key),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.get("/jackett/{instance_id}", response_model=JackettInstanceResponse)
async def get_jackett_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> JackettInstanceResponse:
    """Get a specific Jackett instance."""
    result = await db.execute(select(JackettInstance).where(JackettInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Jackett instance not found")

    return JackettInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(decrypt_credential(instance.api_key)),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.put("/jackett/{instance_id}", response_model=JackettInstanceResponse)
async def update_jackett_instance(
    instance_id: int,
    data: JackettInstanceUpdate,
    db: AsyncSession = Depends(get_db),
) -> JackettInstanceResponse:
    """Update a Jackett instance."""
    result = await db.execute(select(JackettInstance).where(JackettInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Jackett instance not found")

    # Update fields if provided
    if data.name is not None:
        instance.name = data.name
    if data.url is not None:
        instance.url = data.url.rstrip("/")
    if data.api_key is not None:
        instance.api_key = encrypt_credential(data.api_key)

    await db.commit()
    await db.refresh(instance)

    return JackettInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(decrypt_credential(instance.api_key)),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.delete("/jackett/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jackett_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a Jackett instance."""
    result = await db.execute(select(JackettInstance).where(JackettInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Jackett instance not found")

    await db.delete(instance)
    await db.commit()


@router.post("/jackett/{instance_id}/test", response_model=TestConnectionResponse)
async def test_jackett_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> TestConnectionResponse:
    """Test connection to a Jackett instance."""
    result = await db.execute(select(JackettInstance).where(JackettInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Jackett instance not found")

    try:
        api_key = decrypt_credential(instance.api_key)
        service = JackettService(instance.url, api_key)
        success, message, indexer_count = await service.test_connection()

        return TestConnectionResponse(
            success=success,
            message=message,
            indexer_count=indexer_count,
        )
    except Exception as e:
        logger.exception(f"Error testing Jackett instance {instance.name}")
        return TestConnectionResponse(
            success=False,
            message=f"Error: {str(e)}",
            indexer_count=None,
        )


# =============================================================================
# Prowlarr Instance Endpoints
# =============================================================================


@router.get("/prowlarr", response_model=list[ProwlarrInstanceResponse])
async def list_prowlarr_instances(
    db: AsyncSession = Depends(get_db),
) -> list[ProwlarrInstanceResponse]:
    """List all Prowlarr instances."""
    result = await db.execute(select(ProwlarrInstance))
    instances = result.scalars().all()

    return [
        ProwlarrInstanceResponse(
            id=instance.id,
            name=instance.name,
            url=instance.url,
            api_key=mask_api_key(decrypt_credential(instance.api_key)),
            created_at=instance.created_at,
            updated_at=instance.updated_at,
        )
        for instance in instances
    ]


@router.post(
    "/prowlarr", response_model=ProwlarrInstanceResponse, status_code=status.HTTP_201_CREATED
)
async def create_prowlarr_instance(
    data: ProwlarrInstanceCreate,
    db: AsyncSession = Depends(get_db),
) -> ProwlarrInstanceResponse:
    """Create a new Prowlarr instance."""
    # Encrypt the API key before storing
    encrypted_api_key = encrypt_credential(data.api_key)

    instance = ProwlarrInstance(
        name=data.name,
        url=data.url.rstrip("/"),
        api_key=encrypted_api_key,
    )

    db.add(instance)
    await db.commit()
    await db.refresh(instance)

    return ProwlarrInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(data.api_key),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.get("/prowlarr/{instance_id}", response_model=ProwlarrInstanceResponse)
async def get_prowlarr_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> ProwlarrInstanceResponse:
    """Get a specific Prowlarr instance."""
    result = await db.execute(select(ProwlarrInstance).where(ProwlarrInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Prowlarr instance not found")

    return ProwlarrInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(decrypt_credential(instance.api_key)),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.put("/prowlarr/{instance_id}", response_model=ProwlarrInstanceResponse)
async def update_prowlarr_instance(
    instance_id: int,
    data: ProwlarrInstanceUpdate,
    db: AsyncSession = Depends(get_db),
) -> ProwlarrInstanceResponse:
    """Update a Prowlarr instance."""
    result = await db.execute(select(ProwlarrInstance).where(ProwlarrInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Prowlarr instance not found")

    # Update fields if provided
    if data.name is not None:
        instance.name = data.name
    if data.url is not None:
        instance.url = data.url.rstrip("/")
    if data.api_key is not None:
        instance.api_key = encrypt_credential(data.api_key)

    await db.commit()
    await db.refresh(instance)

    return ProwlarrInstanceResponse(
        id=instance.id,
        name=instance.name,
        url=instance.url,
        api_key=mask_api_key(decrypt_credential(instance.api_key)),
        created_at=instance.created_at,
        updated_at=instance.updated_at,
    )


@router.delete("/prowlarr/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prowlarr_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a Prowlarr instance."""
    result = await db.execute(select(ProwlarrInstance).where(ProwlarrInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Prowlarr instance not found")

    await db.delete(instance)
    await db.commit()


@router.post("/prowlarr/{instance_id}/test", response_model=TestConnectionResponse)
async def test_prowlarr_instance(
    instance_id: int,
    db: AsyncSession = Depends(get_db),
) -> TestConnectionResponse:
    """Test connection to a Prowlarr instance."""
    result = await db.execute(select(ProwlarrInstance).where(ProwlarrInstance.id == instance_id))
    instance = result.scalar_one_or_none()

    if not instance:
        raise HTTPException(status_code=404, detail="Prowlarr instance not found")

    try:
        api_key = decrypt_credential(instance.api_key)
        service = ProwlarrService(instance.url, api_key)
        success, message, indexer_count = await service.test_connection()

        return TestConnectionResponse(
            success=success,
            message=message,
            indexer_count=indexer_count,
        )
    except Exception as e:
        logger.exception(f"Error testing Prowlarr instance {instance.name}")
        return TestConnectionResponse(
            success=False,
            message=f"Error: {str(e)}",
            indexer_count=None,
        )


# =============================================================================
# Combined Status Endpoint
# =============================================================================


@router.get("/status", response_model=AllInstancesStatus)
async def get_all_instances_status(
    db: AsyncSession = Depends(get_db),
) -> AllInstancesStatus:
    """
    Get status of all configured instances.

    Returns all Jackett and Prowlarr instances with their online/offline status
    and indexer counts.
    """
    # Get all instances
    jackett_result = await db.execute(select(JackettInstance))
    jackett_instances = jackett_result.scalars().all()

    prowlarr_result = await db.execute(select(ProwlarrInstance))
    prowlarr_instances = prowlarr_result.scalars().all()

    # Get status for each instance
    jackett_with_status: list[JackettInstanceWithStatus] = []
    prowlarr_with_status: list[ProwlarrInstanceWithStatus] = []
    total_online = 0

    for instance in jackett_instances:
        status, indexer_count = await get_instance_status(instance, "jackett")
        if status == "online":
            total_online += 1

        jackett_with_status.append(
            JackettInstanceWithStatus(
                id=instance.id,
                name=instance.name,
                url=instance.url,
                api_key=mask_api_key(decrypt_credential(instance.api_key)),
                created_at=instance.created_at,
                updated_at=instance.updated_at,
                status=status,
                indexer_count=indexer_count,
            )
        )

    for instance in prowlarr_instances:
        status, indexer_count = await get_instance_status(instance, "prowlarr")
        if status == "online":
            total_online += 1

        prowlarr_with_status.append(
            ProwlarrInstanceWithStatus(
                id=instance.id,
                name=instance.name,
                url=instance.url,
                api_key=mask_api_key(decrypt_credential(instance.api_key)),
                created_at=instance.created_at,
                updated_at=instance.updated_at,
                status=status,
                indexer_count=indexer_count,
            )
        )

    return AllInstancesStatus(
        jackett=jackett_with_status,
        prowlarr=prowlarr_with_status,
        total_online=total_online,
    )
