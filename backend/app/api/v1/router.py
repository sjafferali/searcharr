"""
API v1 main router.

Includes all v1 API endpoints for the Searcharr application.
"""

from fastapi import APIRouter

from app.api.v1.clients import router as clients_router
from app.api.v1.download import router as download_router
from app.api.v1.instances import router as instances_router
from app.api.v1.search import router as search_router

# Create main API router
api_router = APIRouter()

# Include sub-routers
api_router.include_router(instances_router)
api_router.include_router(clients_router)
api_router.include_router(search_router)
api_router.include_router(download_router)


@api_router.get("/")
async def root() -> dict[str, str]:
    """API v1 root endpoint."""
    return {"message": "Welcome to Searcharr API v1"}
