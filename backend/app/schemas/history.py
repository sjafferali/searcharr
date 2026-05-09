"""
Pydantic schemas for download history.
"""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import Field

from app.schemas.base import BaseSchema


class HistoryAction(str, Enum):
    """User action that produced a history entry."""

    SENT_TO_CLIENT = "sent_to_client"
    DOWNLOADED_TORRENT = "downloaded_torrent"


class HistoryStatus(str, Enum):
    """Outcome of a history entry."""

    SUCCESS = "success"
    FAILED = "failed"


class HistorySortBy(str, Enum):
    """Available sort fields for history listing."""

    OCCURRED_AT = "occurred_at"
    TITLE = "title"
    SIZE_BYTES = "size_bytes"


class HistoryEntryCreate(BaseSchema):
    """Payload for logging a client-side download action."""

    action: Literal[HistoryAction.DOWNLOADED_TORRENT] = Field(
        HistoryAction.DOWNLOADED_TORRENT,
        description="Action being recorded; only direct .torrent downloads use this endpoint",
    )
    title: str = Field(..., min_length=1, description="Torrent title")
    size_bytes: int | None = Field(None, ge=0, description="File size in bytes")
    info_url: str | None = Field(None, description="Link to torrent info page")
    torrent_url: str | None = Field(None, description="Direct .torrent download URL")
    magnet_link: str | None = Field(None, description="Magnet URI")
    source_type: Literal["jackett", "prowlarr"] = Field(..., description="Type of indexer instance")
    source_instance_id: int | None = Field(None, description="ID of the source instance")
    source_instance_name: str = Field(..., min_length=1, description="Source instance name")
    indexer: str = Field(..., min_length=1, description="Indexer that produced the result")
    search_query: str | None = Field(
        None, max_length=500, description="Search query that surfaced this result"
    )


class HistoryEntryResponse(BaseSchema):
    """A single history row returned to clients."""

    id: int
    occurred_at: datetime
    action: HistoryAction
    status: HistoryStatus
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
    client_id: int | None
    client_name: str | None
    search_query: str | None
    error_message: str | None


class HistoryListResponse(BaseSchema):
    """Paginated list of history entries."""

    total: int = Field(..., description="Total number of entries matching the filters")
    limit: int = Field(..., description="Page size used for this response")
    offset: int = Field(..., description="Offset used for this response")
    entries: list[HistoryEntryResponse] = Field(..., description="History entries")


class HistoryLookupItem(BaseSchema):
    """A single item to look up against the download history."""

    title: str = Field(..., min_length=1)
    size_bytes: int | None = Field(None, ge=0)
    info_url: str | None = None


class HistoryLookupRequest(BaseSchema):
    """Batch lookup request."""

    items: list[HistoryLookupItem] = Field(
        ..., max_length=500, description="Items to look up (max 500 per request)"
    )


class HistoryMatchEntry(BaseSchema):
    """A single prior history record matching a search result."""

    id: int
    occurred_at: datetime
    action: HistoryAction
    status: HistoryStatus
    client_name: str | None = None


class HistoryMatch(BaseSchema):
    """All history matches for a single input item."""

    index: int = Field(..., description="Index in the input ``items`` array")
    count: int = Field(..., description="Total number of prior history rows for this item")
    last_occurred_at: datetime = Field(..., description="Timestamp of the most recent prior entry")
    entries: list[HistoryMatchEntry] = Field(
        ...,
        description="Up to 10 most recent matching entries, newest first",
    )


class HistoryLookupResponse(BaseSchema):
    """Lookup response. Only items with at least one match are included."""

    matches: list[HistoryMatch] = Field(..., description="Matches keyed by input index")
