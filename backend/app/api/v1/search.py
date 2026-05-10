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


def _parse_indexer_filters(values: list[str] | None) -> dict[int, list[str]]:
    """
    Parse indexer filter strings into a mapping of instance_id -> indexer IDs.

    Each value should look like ``"<instance_id>:<indexer_id>"``. Multiple values for
    the same instance_id accumulate into the same list.
    """
    grouped: dict[int, list[str]] = {}
    if not values:
        return grouped

    for raw in values:
        if not raw:
            continue
        if ":" not in raw:
            continue
        instance_part, indexer_part = raw.split(":", 1)
        instance_part = instance_part.strip()
        indexer_part = indexer_part.strip()
        if not instance_part.isdigit() or not indexer_part:
            continue
        instance_id = int(instance_part)
        grouped.setdefault(instance_id, []).append(indexer_part)
    return grouped


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
    jackett_indexers: Annotated[
        list[str] | None,
        Query(
            description=(
                "Restrict Jackett indexers per-instance. Each value is "
                "'<instance_id>:<indexer_slug>'. When provided for an instance, only "
                "the listed indexers are searched on that instance."
            )
        ),
    ] = None,
    prowlarr_indexers: Annotated[
        list[str] | None,
        Query(
            description=(
                "Restrict Prowlarr indexers per-instance. Each value is "
                "'<instance_id>:<indexer_id>'. When provided for an instance, only "
                "the listed indexers are searched on that instance."
            )
        ),
    ] = None,
    exclusive_filter: Annotated[
        bool,
        Query(description="If true, only search specified instances (empty means none, not all)"),
    ] = False,
    sort_by: Annotated[SortBy, Query(description="Sort results by")] = SortBy.SEEDERS,
    sort_order: Annotated[SortOrder, Query(description="Sort order")] = SortOrder.DESC,
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """
    Execute a unified search across all configured indexer instances.

    Query Parameters:
    - **q**: The search query (required)
    - **category**: Filter by category (default: All)
    - **jackett_ids**: List of Jackett instance IDs to include (default: all)
    - **prowlarr_ids**: List of Prowlarr instance IDs to include (default: all)
    - **jackett_indexers**: Optional per-instance indexer restrictions
    - **prowlarr_indexers**: Optional per-instance indexer restrictions
    - **sort_by**: Field to sort by (default: seeders)
    - **sort_order**: Sort order (default: desc)
    """
    aggregator = SearchAggregator(db)

    jackett_indexer_filters = _parse_indexer_filters(jackett_indexers)
    prowlarr_indexer_filters = _parse_indexer_filters(prowlarr_indexers)

    results, errors, sources_queried = await aggregator.search(
        query=q,
        category=category,
        jackett_ids=jackett_ids,
        prowlarr_ids=prowlarr_ids,
        jackett_indexer_filters=jackett_indexer_filters,
        prowlarr_indexer_filters=prowlarr_indexer_filters,
        exclusive_filter=exclusive_filter,
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
