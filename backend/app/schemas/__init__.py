"""
Pydantic schemas package.

This module exports all Pydantic schemas for request/response validation.
"""

from app.schemas.base import (
    BaseSchema,
    StatusResponse,
    TestConnectionResponse,
    TimestampSchema,
)
from app.schemas.bookmark import (
    BookmarkCreate,
    BookmarkListResponse,
    BookmarkLookupItem,
    BookmarkLookupRequest,
    BookmarkLookupResponse,
    BookmarkResponse,
    BookmarkSortBy,
)
from app.schemas.client import (
    DownloadClientCreate,
    DownloadClientResponse,
    DownloadClientUpdate,
    DownloadClientWithStatus,
)
from app.schemas.download import DownloadRequest, DownloadResponse
from app.schemas.feed import (
    FeedCreate,
    FeedFetchResponse,
    FeedFilters,
    FeedIndexerRef,
    FeedItem,
    FeedItemListResponse,
    FeedItemSortBy,
    FeedListResponse,
    FeedResponse,
    FeedSortStrategy,
    FeedUpdate,
)
from app.schemas.history import (
    HistoryAction,
    HistoryEntryCreate,
    HistoryEntryResponse,
    HistoryListResponse,
    HistoryLookupItem,
    HistoryLookupRequest,
    HistoryLookupResponse,
    HistoryMatch,
    HistoryMatchEntry,
    HistorySortBy,
    HistoryStatus,
)
from app.schemas.instance import (
    AllInstancesStatus,
    JackettInstanceCreate,
    JackettInstanceResponse,
    JackettInstanceUpdate,
    JackettInstanceWithStatus,
    ProwlarrInstanceCreate,
    ProwlarrInstanceResponse,
    ProwlarrInstanceUpdate,
    ProwlarrInstanceWithStatus,
)
from app.schemas.search import (
    CATEGORY_MAPPINGS,
    CategoriesResponse,
    IndexerError,
    IndexerInfo,
    IndexersResponse,
    SearchCategory,
    SearchResponse,
    SearchResult,
    SortBy,
    SortOrder,
)

__all__ = [
    # Base
    "BaseSchema",
    "TimestampSchema",
    "StatusResponse",
    "TestConnectionResponse",
    # Bookmarks
    "BookmarkCreate",
    "BookmarkResponse",
    "BookmarkListResponse",
    "BookmarkLookupItem",
    "BookmarkLookupRequest",
    "BookmarkLookupResponse",
    "BookmarkSortBy",
    # Instance
    "JackettInstanceCreate",
    "JackettInstanceUpdate",
    "JackettInstanceResponse",
    "JackettInstanceWithStatus",
    "ProwlarrInstanceCreate",
    "ProwlarrInstanceUpdate",
    "ProwlarrInstanceResponse",
    "ProwlarrInstanceWithStatus",
    "AllInstancesStatus",
    # Client
    "DownloadClientCreate",
    "DownloadClientUpdate",
    "DownloadClientResponse",
    "DownloadClientWithStatus",
    # Search
    "SearchCategory",
    "SortBy",
    "SortOrder",
    "CATEGORY_MAPPINGS",
    "SearchResult",
    "SearchResponse",
    "CategoriesResponse",
    "IndexerError",
    "IndexerInfo",
    "IndexersResponse",
    # Download
    "DownloadRequest",
    "DownloadResponse",
    # Feeds
    "FeedCreate",
    "FeedFetchResponse",
    "FeedFilters",
    "FeedIndexerRef",
    "FeedItem",
    "FeedItemListResponse",
    "FeedItemSortBy",
    "FeedListResponse",
    "FeedResponse",
    "FeedSortStrategy",
    "FeedUpdate",
    # History
    "HistoryAction",
    "HistoryStatus",
    "HistorySortBy",
    "HistoryEntryCreate",
    "HistoryEntryResponse",
    "HistoryListResponse",
    "HistoryLookupItem",
    "HistoryLookupRequest",
    "HistoryLookupResponse",
    "HistoryMatch",
    "HistoryMatchEntry",
]
