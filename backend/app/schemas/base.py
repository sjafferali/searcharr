"""
Base schema classes and common response models.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """Base schema with common configuration."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class TimestampSchema(BaseSchema):
    """Schema mixin for timestamp fields."""

    created_at: datetime
    updated_at: datetime


class StatusResponse(BaseSchema):
    """Generic status response."""

    status: str
    message: str


class TestConnectionResponse(BaseSchema):
    """Response for connection test endpoints."""

    success: bool
    message: str
    indexer_count: int | None = None  # For Jackett/Prowlarr instances
