"""
Search aggregator service for unified search across multiple indexer instances.

This service coordinates searches across all configured Jackett and Prowlarr
instances, aggregating and normalizing results.
"""

import asyncio
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models import JackettInstance, ProwlarrInstance
from app.schemas.search import SearchCategory, SearchResult, SortBy, SortOrder
from app.services.encryption import decrypt_credential
from app.services.jackett import JackettService
from app.services.prowlarr import ProwlarrService

logger = logging.getLogger(__name__)

# Maximum concurrent search requests
SEARCH_CONCURRENT_LIMIT = 10


class SearchAggregator:
    """
    Aggregates search results from multiple Jackett and Prowlarr instances.

    Handles concurrent searches, result normalization, filtering, and sorting.
    """

    def __init__(self, db: AsyncSession) -> None:
        """
        Initialize the search aggregator.

        Args:
            db: Database session for fetching instance configurations
        """
        self.db = db
        self.concurrent_limit = SEARCH_CONCURRENT_LIMIT

    async def search(
        self,
        query: str,
        category: SearchCategory = SearchCategory.ALL,
        jackett_ids: list[int] | None = None,
        prowlarr_ids: list[int] | None = None,
        jackett_indexer_filters: dict[int, list[str]] | None = None,
        prowlarr_indexer_filters: dict[int, list[str]] | None = None,
        exclusive_filter: bool = False,
        sort_by: SortBy = SortBy.SEEDERS,
        sort_order: SortOrder = SortOrder.DESC,
    ) -> tuple[list[SearchResult], list[str], int]:
        """
        Execute a unified search across all selected instances.

        Args:
            query: The search query
            category: Category to filter by
            jackett_ids: List of Jackett instance IDs to search (None = all)
            prowlarr_ids: List of Prowlarr instance IDs to search (None = all)
            jackett_indexer_filters: Optional mapping of Jackett instance_id -> list of
                indexer slugs. When an instance ID has an entry, only the listed indexers
                are queried for that instance.
            prowlarr_indexer_filters: Optional mapping of Prowlarr instance_id -> list of
                indexer IDs. When an instance ID has an entry, only the listed indexers
                are queried for that instance.
            exclusive_filter: If True, None means "search none" instead of "search all"
            sort_by: Field to sort by
            sort_order: Sort order (asc/desc)

        Returns:
            Tuple of (results, errors, sources_queried)
        """
        # In exclusive mode, treat None as "search none" (empty list)
        # This is used when user explicitly selects specific instances
        if exclusive_filter:
            if jackett_ids is None:
                jackett_ids = []
            if prowlarr_ids is None:
                prowlarr_ids = []

        # Get instances to search
        jackett_instances = await self._get_jackett_instances(jackett_ids)
        prowlarr_instances = await self._get_prowlarr_instances(prowlarr_ids)

        sources_queried = len(jackett_instances) + len(prowlarr_instances)

        if sources_queried == 0:
            return [], ["No instances configured"], 0

        jackett_filters = jackett_indexer_filters or {}
        prowlarr_filters = prowlarr_indexer_filters or {}

        # Create search tasks
        tasks: list[asyncio.Task[Any]] = []
        semaphore = asyncio.Semaphore(self.concurrent_limit)

        for instance in jackett_instances:
            indexer_subset = jackett_filters.get(instance.id)
            task = asyncio.create_task(
                self._search_jackett_with_semaphore(
                    semaphore, instance, query, category, indexer_subset
                )
            )
            tasks.append(task)

        for instance in prowlarr_instances:
            indexer_subset = prowlarr_filters.get(instance.id)
            task = asyncio.create_task(
                self._search_prowlarr_with_semaphore(
                    semaphore, instance, query, category, indexer_subset
                )
            )
            tasks.append(task)

        # Execute all searches concurrently
        task_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Aggregate results and collect errors
        all_results: list[SearchResult] = []
        errors: list[str] = []

        for result in task_results:
            if isinstance(result, Exception):
                errors.append(str(result))
            elif isinstance(result, tuple):
                results, error = result
                all_results.extend(results)
                if error:
                    errors.append(error)

        sorted_results = self._sort_results(all_results, sort_by, sort_order)

        return sorted_results, errors, sources_queried

    async def _get_jackett_instances(self, instance_ids: list[int] | None) -> list[JackettInstance]:
        """Get Jackett instances to search."""
        query = select(JackettInstance)
        if instance_ids is not None:
            query = query.where(JackettInstance.id.in_(instance_ids))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _get_prowlarr_instances(
        self, instance_ids: list[int] | None
    ) -> list[ProwlarrInstance]:
        """Get Prowlarr instances to search."""
        query = select(ProwlarrInstance)
        if instance_ids is not None:
            query = query.where(ProwlarrInstance.id.in_(instance_ids))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _search_jackett_with_semaphore(
        self,
        semaphore: asyncio.Semaphore,
        instance: JackettInstance,
        query: str,
        category: SearchCategory,
        indexer_ids: list[str] | None,
    ) -> tuple[list[SearchResult], str | None]:
        """Search a Jackett instance with concurrency control."""
        async with semaphore:
            return await self._search_jackett(instance, query, category, indexer_ids)

    async def _search_jackett(
        self,
        instance: JackettInstance,
        query: str,
        category: SearchCategory,
        indexer_ids: list[str] | None,
    ) -> tuple[list[SearchResult], str | None]:
        """Search a single Jackett instance."""
        try:
            api_key = decrypt_credential(instance.api_key)
            service = JackettService(instance.url, api_key)
            results = await service.search(query, category, instance.name, indexer_ids=indexer_ids)
            return results, None
        except Exception as e:
            logger.exception(f"Error searching Jackett instance {instance.name}")
            return [], f"Error searching {instance.name}: {str(e)}"

    async def _search_prowlarr_with_semaphore(
        self,
        semaphore: asyncio.Semaphore,
        instance: ProwlarrInstance,
        query: str,
        category: SearchCategory,
        indexer_ids: list[str] | None,
    ) -> tuple[list[SearchResult], str | None]:
        """Search a Prowlarr instance with concurrency control."""
        async with semaphore:
            return await self._search_prowlarr(instance, query, category, indexer_ids)

    async def _search_prowlarr(
        self,
        instance: ProwlarrInstance,
        query: str,
        category: SearchCategory,
        indexer_ids: list[str] | None,
    ) -> tuple[list[SearchResult], str | None]:
        """Search a single Prowlarr instance."""
        try:
            api_key = decrypt_credential(instance.api_key)
            service = ProwlarrService(instance.url, api_key)
            results = await service.search(query, category, instance.name, indexer_ids=indexer_ids)
            return results, None
        except Exception as e:
            logger.exception(f"Error searching Prowlarr instance {instance.name}")
            return [], f"Error searching {instance.name}: {str(e)}"

    def _sort_results(
        self,
        results: list[SearchResult],
        sort_by: SortBy,
        sort_order: SortOrder,
    ) -> list[SearchResult]:
        """
        Sort search results.

        Args:
            results: List of search results
            sort_by: Field to sort by
            sort_order: Sort order

        Returns:
            Sorted list of results
        """
        reverse = sort_order == SortOrder.DESC

        if sort_by == SortBy.SEEDERS:
            return sorted(results, key=lambda r: r.seeders, reverse=reverse)
        elif sort_by == SortBy.SIZE:
            return sorted(results, key=lambda r: r.size, reverse=reverse)
        elif sort_by == SortBy.DATE:
            # Handle None dates by using a very old date for sorting
            from datetime import datetime

            min_date = datetime.min
            return sorted(
                results,
                key=lambda r: r.date if r.date else min_date,
                reverse=reverse,
            )
        elif sort_by == SortBy.NAME:
            return sorted(results, key=lambda r: r.title.lower(), reverse=reverse)
        else:
            return results
