"""
API v1 main router.
"""

from fastapi import APIRouter

# Create main API router
api_router = APIRouter()

# Add your API routes here
# Example:
# from backend.app.api.v1.endpoints import users
# api_router.include_router(users.router, prefix="/users", tags=["users"])


@api_router.get("/")
async def root() -> dict[str, str]:
    """API v1 root endpoint."""
    return {"message": "Welcome to API v1"}
