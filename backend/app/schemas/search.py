"""
Pydantic schemas for search operations.
"""

from datetime import datetime
from enum import Enum

from pydantic import Field

from app.schemas.base import BaseSchema


class SearchCategory(str, Enum):
    """Available search categories (Newznab standard)."""

    ALL = "All"
    MOVIES = "Movies"
    TV = "TV"
    MUSIC = "Music"
    SOFTWARE = "Software"
    GAMES = "Games"
    BOOKS = "Books"
    ANIME = "Anime"
    OTHER = "Other"


class SortBy(str, Enum):
    """Available sort options for search results."""

    SEEDERS = "seeders"
    SIZE = "size"
    DATE = "date"
    NAME = "name"


class SortOrder(str, Enum):
    """Sort order options."""

    ASC = "asc"
    DESC = "desc"


# Newznab category ID mappings
CATEGORY_MAPPINGS: dict[SearchCategory, list[int] | None] = {
    SearchCategory.ALL: None,  # No filter
    SearchCategory.MOVIES: [2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060],
    SearchCategory.TV: [5000, 5010, 5020, 5030, 5040, 5045, 5050, 5060, 5070, 5080],
    SearchCategory.MUSIC: [3000, 3010, 3020, 3030, 3040],
    SearchCategory.SOFTWARE: [4000, 4010, 4020, 4030, 4040, 4050, 4060, 4070],
    SearchCategory.GAMES: [1000, 1010, 1020, 1030, 1040, 1050, 1060, 1070, 1080],
    SearchCategory.BOOKS: [7000, 7010, 7020, 7030, 7040, 7050, 7060],
    SearchCategory.ANIME: [5070],
    SearchCategory.OTHER: [8000, 8010, 8020],
}


class SearchResult(BaseSchema):
    """Individual search result from an indexer."""

    id: str = Field(..., description="Unique identifier for this result")
    title: str = Field(..., description="Torrent title")
    source: str = Field(..., description="Instance name that found this result")
    source_type: str = Field(..., description="jackett or prowlarr")
    indexer: str = Field(..., description="Specific indexer within the instance")
    size: int = Field(..., description="File size in bytes")
    size_formatted: str = Field(..., description="Human-readable file size (e.g., '4.7 GB')")
    seeders: int = Field(..., ge=0, description="Number of seeders")
    leechers: int = Field(..., ge=0, description="Number of leechers")
    date: datetime | None = Field(None, description="Upload/publish date")
    category: str = Field(..., description="Category name")
    magnet_link: str | None = Field(None, description="Magnet URI if available")
    torrent_url: str | None = Field(None, description="Direct .torrent download URL if available")
    info_url: str | None = Field(None, description="Link to torrent info page")
    freeleech: bool = Field(
        False,
        description="True when the indexer reports this release as freeleech (no download counted)",
    )
    download_volume_factor: float | None = Field(
        None,
        description="Raw download volume factor (0 = freeleech, 0.5 = half-leech, 1 = normal)",
    )


class IndexerError(BaseSchema):
    """
    A failure encountered while querying a specific indexer (or instance).

    Surfaced so the UI can tell the user *why* an indexer they selected
    returned nothing — a rate limit (HTTP 429), an upstream indexer that
    Prowlarr/Jackett has disabled after repeated failures, a timeout, an
    auth error, etc. — rather than the search/feed silently showing zero
    results.
    """

    source: str = Field(..., description="Instance name the failure came from (empty if app-level)")
    message: str = Field(..., description="Human-readable description of the failure")
    # jackett, prowlarr, or "" for app-level messages
    source_type: str = ""
    # Indexer name/id, or None when the failure is instance- or app-level
    indexer: str | None = None


class IndexerInfo(BaseSchema):
    """A single indexer configured on a Jackett or Prowlarr instance."""

    id: str = Field(..., description="Indexer identifier within the instance")
    name: str = Field(..., description="Display name of the indexer")
    type: str | None = Field(
        None,
        description="Indexer privacy type (public, private, semi-private)",
    )
    enabled: bool = Field(True, description="Whether the indexer is enabled on the instance")


class IndexersResponse(BaseSchema):
    """List of indexers available on a single instance."""

    instance_id: int = Field(..., description="ID of the instance these indexers belong to")
    instance_type: str = Field(..., description="jackett or prowlarr")
    indexers: list[IndexerInfo] = Field(..., description="Indexers configured on the instance")


class SearchResponse(BaseSchema):
    """Response containing search results."""

    query: str = Field(..., description="The search query that was executed")
    category: SearchCategory = Field(..., description="Category filter applied")
    total_results: int = Field(..., description="Total number of results")
    results: list[SearchResult] = Field(..., description="List of search results")
    sources_queried: int = Field(..., description="Number of instances queried")
    errors: list[IndexerError] = Field(
        default_factory=list, description="Per-indexer / per-instance failures encountered"
    )


class CategoriesResponse(BaseSchema):
    """Response containing available categories."""

    categories: list[str] = Field(..., description="List of available category names")
