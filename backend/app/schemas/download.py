"""
Pydantic schemas for download operations.
"""

from pydantic import Field

from app.schemas.base import BaseSchema


class DownloadRequest(BaseSchema):
    """Request to send a torrent to a download client."""

    client_id: int = Field(..., description="ID of the download client to use")
    magnet_link: str | None = Field(None, description="Magnet URI to download")
    torrent_url: str | None = Field(None, description="URL to .torrent file to download")

    def model_post_init(self, __context) -> None:
        """Validate that either magnet_link or torrent_url is provided."""
        if not self.magnet_link and not self.torrent_url:
            raise ValueError("Either magnet_link or torrent_url must be provided")


class DownloadResponse(BaseSchema):
    """Response from download operation."""

    success: bool = Field(..., description="Whether the download was successfully added")
    message: str = Field(..., description="Status message")
    client_name: str = Field(..., description="Name of the client the torrent was sent to")
