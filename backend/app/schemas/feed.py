"""
Pydantic schemas for saved feeds.
"""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema
from app.schemas.search import SearchCategory, SearchResult

POLL_INTERVAL_MIN = 5
POLL_INTERVAL_MAX = 1440
RETENTION_DAYS_MIN = 1
RETENTION_DAYS_MAX = 365


class FeedSortStrategy(str, Enum):
    """How merged feed results are ordered before being returned."""

    DATE_DESC = "date_desc"
    INDEXER_ORDER = "indexer_order"


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
    sort_strategy: FeedSortStrategy = Field(
        FeedSortStrategy.DATE_DESC,
        description=(
            "How to order the merged result list. ``date_desc`` (default) "
            "sorts by ``pubDate`` descending. ``indexer_order`` preserves "
            "the order each instance returned, letting an indexer-side "
            "``orderby=`` reach the UI."
        ),
    )
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
    poll_interval_minutes: int = Field(
        15,
        ge=POLL_INTERVAL_MIN,
        le=POLL_INTERVAL_MAX,
        description="Minutes between background polls",
    )
    retention_days: int = Field(
        30,
        ge=RETENTION_DAYS_MIN,
        le=RETENTION_DAYS_MAX,
        description="Days to retain observed items before pruning",
    )
    polling_enabled: bool = Field(
        True, description="Disable to pause background polling without losing history"
    )
    indexers: list[FeedIndexerRef] = Field(
        ..., min_length=1, description="Indexer references this feed pulls from"
    )


class FeedUpdate(BaseSchema):
    """Payload for updating an existing feed."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    sort_strategy: FeedSortStrategy | None = None
    filters: FeedFilters | None = None
    poll_interval_minutes: int | None = Field(None, ge=POLL_INTERVAL_MIN, le=POLL_INTERVAL_MAX)
    retention_days: int | None = Field(None, ge=RETENTION_DAYS_MIN, le=RETENTION_DAYS_MAX)
    polling_enabled: bool | None = None
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
    sort_strategy: FeedSortStrategy
    filters: FeedFilters
    indexers: list[FeedIndexerRef]
    poll_interval_minutes: int
    retention_days: int
    polling_enabled: bool
    last_polled_at: datetime | None
    stale_after_seconds: int
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


class FeedItemSortBy(str, Enum):
    """Sort columns available on the persisted feed-item listing."""

    LAST_SEEN = "last_seen"
    FIRST_SEEN = "first_seen"
    PUB_DATE = "pub_date"
    SEEDERS = "seeders"
    SIZE = "size"
    TITLE = "title"


class FeedItem(BaseSchema):
    """
    A single persisted feed item.

    Field names mirror ``SearchResult`` (``id``, ``source``, ``size``,
    ``date``) so the existing row renderers on the frontend keep working
    without a per-field adapter. ``id`` is the row's ``dedup_key`` (stable
    per-feed) so React keys / bookmark+history lookups behave identically
    to live search results. ``first_seen_at`` / ``last_seen_at`` /
    ``dedup_key`` carry the polling-specific signals.
    """

    id: str
    item_id: int
    first_seen_at: datetime
    last_seen_at: datetime
    title: str
    source: str
    source_type: Literal["jackett", "prowlarr"]
    indexer: str
    size: int
    size_formatted: str
    seeders: int
    leechers: int
    date: datetime | None
    category: str
    magnet_link: str | None
    torrent_url: str | None
    info_url: str | None
    freeleech: bool
    download_volume_factor: float | None
    dedup_key: str


class FeedItemListResponse(BaseSchema):
    """Paged listing of persisted feed items for one feed."""

    total: int
    entries: list[FeedItem]
    feed_id: int
    feed_name: str
    last_polled_at: datetime | None
    next_poll_at: datetime | None
    stale_after_seconds: int
    polling_enabled: bool
