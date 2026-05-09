"""
Pydantic schemas for download operations.
"""

from typing import Any, Literal

from pydantic import Field

from app.schemas.base import BaseSchema


class DownloadRequest(BaseSchema):
    """Request to send a torrent to a download client."""

    client_id: int = Field(..., description="ID of the download client to use")
    magnet_link: str | None = Field(None, description="Magnet URI to download")
    torrent_url: str | None = Field(None, description="URL to .torrent file to download")

    title: str = Field(..., min_length=1, description="Torrent title (logged to history)")
    size_bytes: int | None = Field(None, ge=0, description="File size in bytes")
    info_url: str | None = Field(None, description="Link to torrent info page")
    source_type: Literal["jackett", "prowlarr"] = Field(
        ..., description="Type of indexer instance that produced the result"
    )
    source_instance_id: int | None = Field(None, description="ID of the source instance")
    source_instance_name: str = Field(..., min_length=1, description="Source instance name")
    indexer: str = Field(..., min_length=1, description="Indexer that produced the result")
    search_query: str | None = Field(
        None, max_length=500, description="Search query that surfaced this result"
    )

    def model_post_init(self, __context: Any) -> None:
        """Validate that either magnet_link or torrent_url is provided."""
        if not self.magnet_link and not self.torrent_url:
            raise ValueError("Either magnet_link or torrent_url must be provided")


class DownloadResponse(BaseSchema):
    """Response from download operation."""

    success: bool = Field(..., description="Whether the download was successfully added")
    message: str = Field(..., description="Status message")
    client_name: str = Field(..., description="Name of the client the torrent was sent to")
