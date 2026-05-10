"""
Feed service: fetches the latest releases for saved feeds and applies filters.

A feed groups one or more (instance, indexer) tuples together with optional
result-shaping filters. The service fans out one ``get_latest`` request per
referenced instance (limited to that instance's selected indexers), then
applies the feed's filter set client-side.
"""

import asyncio
import logging
import re
from collections import defaultdict
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models import Feed, FeedIndexer, JackettInstance, ProwlarrInstance
from app.schemas.feed import FeedFilters, FeedSortStrategy
from app.schemas.search import SearchCategory, SearchResult
from app.services.encryption import decrypt_credential
from app.services.jackett import JackettService
from app.services.prowlarr import ProwlarrService

logger = logging.getLogger(__name__)

# Maximum concurrent latest-feed requests across instances
FEED_FETCH_CONCURRENT_LIMIT = 10


class FeedService:
    """Fetches and filters the latest results for a saved feed."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.concurrent_limit = FEED_FETCH_CONCURRENT_LIMIT

    async def fetch(self, feed: Feed) -> tuple[list[SearchResult], list[str], int]:
        """
        Run the feed: fetch latest releases from each referenced instance,
        merge results, then apply the feed's filters.

        Returns:
            Tuple of (filtered_results, errors, sources_queried).
        """
        if not feed.indexers:
            return [], ["Feed has no indexers configured"], 0

        category = SearchCategory(feed.category)

        jackett_groups: dict[int, list[FeedIndexer]] = defaultdict(list)
        prowlarr_groups: dict[int, list[FeedIndexer]] = defaultdict(list)
        for entry in feed.indexers:
            if entry.source_type == "jackett":
                jackett_groups[entry.source_instance_id].append(entry)
            elif entry.source_type == "prowlarr":
                prowlarr_groups[entry.source_instance_id].append(entry)

        jackett_instances = await self._load_jackett_instances(list(jackett_groups.keys()))
        prowlarr_instances = await self._load_prowlarr_instances(list(prowlarr_groups.keys()))

        sources_queried = len(jackett_instances) + len(prowlarr_instances)
        if sources_queried == 0:
            return [], ["None of this feed's instances are still configured"], 0

        semaphore = asyncio.Semaphore(self.concurrent_limit)
        tasks: list[asyncio.Task[Any]] = []

        for instance in jackett_instances:
            entries = jackett_groups.get(instance.id, [])
            indexer_ids = [e.indexer_id for e in entries]
            tasks.append(
                asyncio.create_task(self._fetch_jackett(semaphore, instance, indexer_ids, category))
            )

        for instance in prowlarr_instances:
            entries = prowlarr_groups.get(instance.id, [])
            indexer_ids = [e.indexer_id for e in entries]
            tasks.append(
                asyncio.create_task(
                    self._fetch_prowlarr(semaphore, instance, indexer_ids, category)
                )
            )

        task_results = await asyncio.gather(*tasks, return_exceptions=True)

        all_results: list[SearchResult] = []
        errors: list[str] = []
        for outcome in task_results:
            if isinstance(outcome, Exception):
                errors.append(str(outcome))
            elif isinstance(outcome, tuple):
                results, err = outcome
                all_results.extend(results)
                if err:
                    errors.append(err)

        filters = FeedFilters(
            category=category,
            freeleech_only=feed.freeleech_only,
            min_seeders=feed.min_seeders,
            min_size_bytes=feed.min_size_bytes,
            max_size_bytes=feed.max_size_bytes,
            include_regex=feed.include_regex,
            exclude_regex=feed.exclude_regex,
        )

        filtered = self._apply_filters(all_results, filters, errors)

        # Default ``date_desc`` sorts the merged stream by ``pubDate``
        # descending. ``indexer_order`` skips that sort so a per-instance
        # ``orderby=`` (e.g. Prowlarr's ``freeleechstart``) reaches the UI
        # in the order the indexer emitted; instances are concatenated in
        # the order they were dispatched (Jackett first, then Prowlarr).
        if feed.sort_strategy == FeedSortStrategy.INDEXER_ORDER.value:
            return filtered, errors, sources_queried

        filtered.sort(
            key=lambda r: r.date.timestamp() if r.date else 0.0,
            reverse=True,
        )

        return filtered, errors, sources_queried

    @staticmethod
    def _apply_filters(
        results: list[SearchResult],
        filters: FeedFilters,
        errors: list[str],
    ) -> list[SearchResult]:
        include_re: re.Pattern[str] | None = None
        exclude_re: re.Pattern[str] | None = None

        if filters.include_regex:
            try:
                include_re = re.compile(filters.include_regex, re.IGNORECASE)
            except re.error as exc:
                errors.append(f"Invalid include regex: {exc}")
        if filters.exclude_regex:
            try:
                exclude_re = re.compile(filters.exclude_regex, re.IGNORECASE)
            except re.error as exc:
                errors.append(f"Invalid exclude regex: {exc}")

        kept: list[SearchResult] = []
        for item in results:
            if filters.freeleech_only and not item.freeleech:
                continue
            if filters.min_seeders and item.seeders < filters.min_seeders:
                continue
            if filters.min_size_bytes is not None and item.size < filters.min_size_bytes:
                continue
            if filters.max_size_bytes is not None and item.size > filters.max_size_bytes:
                continue
            if include_re and not include_re.search(item.title):
                continue
            if exclude_re and exclude_re.search(item.title):
                continue
            kept.append(item)
        return kept

    async def _load_jackett_instances(self, instance_ids: list[int]) -> list[JackettInstance]:
        if not instance_ids:
            return []
        result = await self.db.execute(
            select(JackettInstance).where(JackettInstance.id.in_(instance_ids))
        )
        return list(result.scalars().all())

    async def _load_prowlarr_instances(self, instance_ids: list[int]) -> list[ProwlarrInstance]:
        if not instance_ids:
            return []
        result = await self.db.execute(
            select(ProwlarrInstance).where(ProwlarrInstance.id.in_(instance_ids))
        )
        return list(result.scalars().all())

    async def _fetch_jackett(
        self,
        semaphore: asyncio.Semaphore,
        instance: JackettInstance,
        indexer_ids: list[str],
        category: SearchCategory,
    ) -> tuple[list[SearchResult], str | None]:
        async with semaphore:
            try:
                api_key = decrypt_credential(instance.api_key)
                service = JackettService(instance.url, api_key)
                results = await service.get_latest(
                    instance_name=instance.name,
                    indexer_ids=indexer_ids,
                    category=category,
                )
                return results, None
            except Exception as exc:
                logger.exception(f"Error fetching latest from Jackett instance {instance.name}")
                return [], f"{instance.name}: {exc}"

    async def _fetch_prowlarr(
        self,
        semaphore: asyncio.Semaphore,
        instance: ProwlarrInstance,
        indexer_ids: list[str],
        category: SearchCategory,
    ) -> tuple[list[SearchResult], str | None]:
        async with semaphore:
            try:
                api_key = decrypt_credential(instance.api_key)
                service = ProwlarrService(instance.url, api_key)
                results = await service.get_latest(
                    instance_name=instance.name,
                    indexer_ids=indexer_ids,
                    category=category,
                )
                return results, None
            except Exception as exc:
                logger.exception(f"Error fetching latest from Prowlarr instance {instance.name}")
                return [], f"{instance.name}: {exc}"
