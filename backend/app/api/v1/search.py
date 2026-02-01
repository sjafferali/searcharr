"""
API endpoints for search operations.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import CategoriesResponse, SearchCategory, SearchResponse, SortBy, SortOrder
from app.services import SearchAggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search(
    q: Annotated[str, Query(min_length=1, max_length=500, description="Search query")],
    category: Annotated[SearchCategory, Query(description="Category filter")] = SearchCategory.ALL,
    jackett_ids: Annotated[
        list[int] | None,
        Query(description="List of Jackett instance IDs to search (omit for all)"),
    ] = None,
    prowlarr_ids: Annotated[
        list[int] | None,
        Query(description="List of Prowlarr instance IDs to search (omit for all)"),
    ] = None,
    exclusive_filter: Annotated[
        bool,
        Query(description="If true, only search specified instances (empty means none, not all)"),
    ] = False,
    min_seeders: Annotated[
        int,
        Query(ge=0, description="Minimum number of seeders"),
    ] = 0,
    max_size: Annotated[
        str | None,
        Query(description="Maximum file size (e.g., '10GB', '500MB')"),
    ] = None,
    sort_by: Annotated[SortBy, Query(description="Sort results by")] = SortBy.SEEDERS,
    sort_order: Annotated[SortOrder, Query(description="Sort order")] = SortOrder.DESC,
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """
    Execute a unified search across all configured indexer instances.

    This endpoint searches all selected Jackett and Prowlarr instances concurrently,
    aggregates the results, applies filters, and returns sorted results.

    Query Parameters:
    - **q**: The search query (required)
    - **category**: Filter by category (default: All)
    - **jackett_ids**: List of Jackett instance IDs to include (default: all)
    - **prowlarr_ids**: List of Prowlarr instance IDs to include (default: all)
    - **min_seeders**: Minimum number of seeders (default: 0)
    - **max_size**: Maximum file size filter (e.g., "10GB")
    - **sort_by**: Field to sort by (default: seeders)
    - **sort_order**: Sort order (default: desc)

    Returns aggregated search results from all queried instances.
    """
    aggregator = SearchAggregator(db)

    results, errors, sources_queried = await aggregator.search(
        query=q,
        category=category,
        jackett_ids=jackett_ids,
        prowlarr_ids=prowlarr_ids,
        exclusive_filter=exclusive_filter,
        min_seeders=min_seeders,
        max_size=max_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return SearchResponse(
        query=q,
        category=category,
        total_results=len(results),
        results=results,
        sources_queried=sources_queried,
        errors=errors,
    )


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories() -> CategoriesResponse:
    """
    Get list of available search categories.

    Returns the list of predefined categories that can be used to filter search results.
    """
    categories = [cat.value for cat in SearchCategory]
    return CategoriesResponse(categories=categories)
