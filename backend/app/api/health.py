"""
Health check endpoints.
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    """
    Basic health check endpoint.
    """
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }


@router.get("/health/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """
    Readiness check endpoint.
    Verifies database connectivity.
    """
    try:
        # Test database connection
        result = await db.execute(text("SELECT 1"))
        result.scalar()

        return {
            "status": "ready",
            "database": "connected",
            "version": settings.APP_VERSION,
        }
    except Exception as e:
        return {
            "status": "not_ready",
            "database": "disconnected",
            "error": str(e),
            "version": settings.APP_VERSION,
        }
