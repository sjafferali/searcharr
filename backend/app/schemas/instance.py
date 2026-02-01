"""
Pydantic schemas for Jackett and Prowlarr instance management.
"""

from pydantic import Field, HttpUrl

from app.schemas.base import BaseSchema, TimestampSchema


# =============================================================================
# Jackett Instance Schemas
# =============================================================================


class JackettInstanceBase(BaseSchema):
    """Base schema for Jackett instance data."""

    name: str = Field(..., min_length=1, max_length=255, description="Display name for the instance")
    url: str = Field(..., description="Jackett server URL (e.g., http://192.168.1.100:9117)")
    api_key: str = Field(..., min_length=1, description="Jackett API key")


class JackettInstanceCreate(JackettInstanceBase):
    """Schema for creating a new Jackett instance."""

    pass


class JackettInstanceUpdate(BaseSchema):
    """Schema for updating a Jackett instance. All fields are optional."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Display name for the instance")
    url: str | None = Field(None, description="Jackett server URL")
    api_key: str | None = Field(None, min_length=1, description="Jackett API key")


class JackettInstanceResponse(JackettInstanceBase, TimestampSchema):
    """Schema for Jackett instance response (returned from API)."""

    id: int
    api_key: str = Field(..., description="Masked API key for display")

    @classmethod
    def mask_api_key(cls, api_key: str) -> str:
        """Mask API key for safe display."""
        if len(api_key) <= 8:
            return "*" * len(api_key)
        return api_key[:4] + "..." + api_key[-4:]


class JackettInstanceWithStatus(JackettInstanceResponse):
    """Jackett instance response with runtime status information."""

    status: str = Field(..., description="online or offline")
    indexer_count: int | None = Field(None, description="Number of configured indexers")


# =============================================================================
# Prowlarr Instance Schemas
# =============================================================================


class ProwlarrInstanceBase(BaseSchema):
    """Base schema for Prowlarr instance data."""

    name: str = Field(..., min_length=1, max_length=255, description="Display name for the instance")
    url: str = Field(..., description="Prowlarr server URL (e.g., http://192.168.1.100:9696)")
    api_key: str = Field(..., min_length=1, description="Prowlarr API key")


class ProwlarrInstanceCreate(ProwlarrInstanceBase):
    """Schema for creating a new Prowlarr instance."""

    pass


class ProwlarrInstanceUpdate(BaseSchema):
    """Schema for updating a Prowlarr instance. All fields are optional."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Display name for the instance")
    url: str | None = Field(None, description="Prowlarr server URL")
    api_key: str | None = Field(None, min_length=1, description="Prowlarr API key")


class ProwlarrInstanceResponse(ProwlarrInstanceBase, TimestampSchema):
    """Schema for Prowlarr instance response (returned from API)."""

    id: int
    api_key: str = Field(..., description="Masked API key for display")


class ProwlarrInstanceWithStatus(ProwlarrInstanceResponse):
    """Prowlarr instance response with runtime status information."""

    status: str = Field(..., description="online or offline")
    indexer_count: int | None = Field(None, description="Number of configured indexers")


# =============================================================================
# Combined Status Response
# =============================================================================


class AllInstancesStatus(BaseSchema):
    """Response containing status of all configured instances."""

    jackett: list[JackettInstanceWithStatus]
    prowlarr: list[ProwlarrInstanceWithStatus]
    total_online: int = Field(..., description="Total number of online instances")
