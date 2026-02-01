"""
Pydantic schemas for download client management.
"""

from pydantic import Field

from app.models.client import ClientType
from app.schemas.base import BaseSchema, TimestampSchema


class DownloadClientBase(BaseSchema):
    """Base schema for download client data."""

    name: str = Field(..., min_length=1, max_length=255, description="Display name for the client")
    client_type: ClientType = Field(..., description="Type of download client")
    url: str = Field(..., description="Client web interface URL (e.g., http://192.168.1.100:8080)")
    username: str = Field(..., min_length=1, description="Username for authentication")
    password: str = Field(..., min_length=1, description="Password for authentication")


class DownloadClientCreate(DownloadClientBase):
    """Schema for creating a new download client."""

    pass


class DownloadClientUpdate(BaseSchema):
    """Schema for updating a download client. All fields are optional."""

    name: str | None = Field(None, min_length=1, max_length=255, description="Display name for the client")
    client_type: ClientType | None = Field(None, description="Type of download client")
    url: str | None = Field(None, description="Client web interface URL")
    username: str | None = Field(None, min_length=1, description="Username for authentication")
    password: str | None = Field(None, min_length=1, description="Password for authentication")


class DownloadClientResponse(TimestampSchema):
    """Schema for download client response (returned from API)."""

    id: int
    name: str
    client_type: ClientType
    url: str
    # Note: username and password are NOT returned for security


class DownloadClientWithStatus(DownloadClientResponse):
    """Download client response with runtime status information."""

    status: str = Field(..., description="online or offline")
