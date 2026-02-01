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
from app.schemas.client import (
    DownloadClientCreate,
    DownloadClientResponse,
    DownloadClientUpdate,
    DownloadClientWithStatus,
)
from app.schemas.download import DownloadRequest, DownloadResponse
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
    # Download
    "DownloadRequest",
    "DownloadResponse",
]
