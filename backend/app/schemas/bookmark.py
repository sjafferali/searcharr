"""
Pydantic schemas for bookmarks.
"""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema


class BookmarkSortBy(str, Enum):
    """Available sort fields for bookmark listing."""

    CREATED_AT = "created_at"
    TITLE = "title"
    SIZE_BYTES = "size_bytes"


class BookmarkCreate(BaseSchema):
    """Payload for creating a bookmark from a search result."""

    title: str = Field(..., min_length=1, description="Result title")
    size_bytes: int | None = Field(None, ge=0, description="File size in bytes")
    info_url: str | None = Field(None, description="Link to torrent info page")
    torrent_url: str | None = Field(None, description="Direct .torrent download URL")
    magnet_link: str | None = Field(None, description="Magnet URI")
    source_type: Literal["jackett", "prowlarr"] = Field(..., description="Type of indexer instance")
    source_instance_id: int | None = Field(None, description="ID of the source instance")
    source_instance_name: str = Field(..., min_length=1, description="Source instance name")
    indexer: str = Field(..., min_length=1, description="Indexer that produced the result")
    category: str | None = Field(None, max_length=64, description="Category label from the result")
    notes: str | None = Field(None, description="Optional user-supplied notes")


class BookmarkResponse(BaseSchema):
    """A single bookmark row returned to clients."""

    id: int
    created_at: datetime
    title: str
    size_bytes: int | None
    size_formatted: str = Field(..., description="Human-readable file size")
    info_url: str | None
    torrent_url: str | None
    magnet_link: str | None
    source_type: str
    source_instance_id: int | None
    source_instance_name: str
    indexer: str
    category: str | None
    notes: str | None
    dedup_key: str = Field(
        ..., description="Stable identity used for de-duplication and current-result lookup"
    )


class BookmarkListResponse(BaseSchema):
    """List of bookmarks."""

    total: int = Field(..., description="Total number of bookmarks")
    entries: list[BookmarkResponse] = Field(..., description="Bookmark entries")


class BookmarkLookupItem(BaseSchema):
    """A single item from the current search result set to test for an existing bookmark."""

    info_url: str | None = None
    torrent_url: str | None = None
    magnet_link: str | None = None
    # Identity fields for the content-signature dedup key. Optional so older
    # clients that only send the URL fields still get a (less robust) match.
    source_instance_name: str | None = None
    indexer: str | None = None
    title: str | None = None
    size_bytes: int | None = None


class BookmarkLookupRequest(BaseSchema):
    """Batch request: which of these items are already bookmarked?"""

    items: list[BookmarkLookupItem]


class BookmarkLookupResponse(BaseSchema):
    """
    Maps each requested item's dedup_key to its bookmark id (if present).

    Clients compute the dedup_key client-side using the same normalization
    rule as the server, then look up the id in this map to know whether to
    render the bookmark icon as filled.
    """

    matches: dict[str, int] = Field(
        ..., description="dedup_key -> bookmark id, only includes bookmarked items"
    )
