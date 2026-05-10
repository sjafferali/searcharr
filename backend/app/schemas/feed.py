"""
Pydantic schemas for saved feeds.
"""

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema
from app.schemas.search import SearchCategory, SearchResult


class FeedIndexerRef(BaseSchema):
    """Reference to one indexer on a Jackett/Prowlarr instance."""

    source_type: Literal["jackett", "prowlarr"] = Field(
        ..., description="Type of the source instance"
    )
    source_instance_id: int = Field(..., description="ID of the source instance")
    source_instance_name: str = Field(
        ..., min_length=1, description="Display name of the source instance"
    )
    indexer_id: str = Field(..., min_length=1, description="Indexer slug or numeric id")
    indexer_name: str = Field(..., min_length=1, description="Display name of the indexer")


class FeedFilters(BaseSchema):
    """Result-shaping filters that apply when fetching a feed."""

    category: SearchCategory = Field(SearchCategory.ALL, description="Newznab category filter")
    freeleech_only: bool = Field(False, description="Only include items flagged as freeleech")
    min_seeders: int = Field(0, ge=0, description="Hide items with fewer seeders than this")
    min_size_bytes: int | None = Field(
        None, ge=0, description="Hide items smaller than this many bytes"
    )
    max_size_bytes: int | None = Field(
        None, ge=0, description="Hide items larger than this many bytes"
    )
    include_regex: str | None = Field(
        None, description="Only show items whose title matches this regex (case-insensitive)"
    )
    exclude_regex: str | None = Field(
        None, description="Hide items whose title matches this regex (case-insensitive)"
    )

    @field_validator("include_regex", "exclude_regex")
    @classmethod
    def _empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class FeedCreate(BaseSchema):
    """Payload for creating a new feed."""

    name: str = Field(..., min_length=1, max_length=255, description="Display name for the feed")
    description: str | None = Field(None, description="Optional notes about this feed")
    filters: FeedFilters = Field(
        default_factory=lambda: FeedFilters(
            category=SearchCategory.ALL,
            freeleech_only=False,
            min_seeders=0,
            min_size_bytes=None,
            max_size_bytes=None,
            include_regex=None,
            exclude_regex=None,
        )
    )
    indexers: list[FeedIndexerRef] = Field(
        ..., min_length=1, description="Indexer references this feed pulls from"
    )


class FeedUpdate(BaseSchema):
    """Payload for updating an existing feed."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    filters: FeedFilters | None = None
    indexers: list[FeedIndexerRef] | None = Field(
        None,
        min_length=1,
        description="When provided, replaces the entire indexer list",
    )


class FeedResponse(BaseSchema):
    """A saved feed returned to clients."""

    id: int
    name: str
    description: str | None
    filters: FeedFilters
    indexers: list[FeedIndexerRef]
    created_at: datetime
    updated_at: datetime


class FeedListResponse(BaseSchema):
    """Listing of all saved feeds."""

    total: int
    entries: list[FeedResponse]


class FeedFetchResponse(BaseSchema):
    """Latest results from one feed, post-filtering."""

    feed_id: int
    feed_name: str
    fetched_at: datetime
    total_results: int
    results: list[SearchResult]
    sources_queried: int
    errors: list[str] = Field(default_factory=list)
