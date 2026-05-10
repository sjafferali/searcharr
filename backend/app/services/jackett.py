"""
Jackett API service for searching torrent indexers.

Jackett is a proxy server that translates queries from apps into
tracker-site-specific HTTP queries, fetching results, and parsing them.
"""

import asyncio
import logging
from typing import Any
from urllib.parse import urljoin

import httpx

from app.schemas.search import CATEGORY_MAPPINGS, IndexerInfo, SearchCategory, SearchResult
from app.services.torznab import parse_torznab_response

logger = logging.getLogger(__name__)

# Default timeout for Jackett API requests (seconds)
JACKETT_TIMEOUT = 30


class JackettService:
    """Service for interacting with Jackett API."""

    def __init__(self, base_url: str, api_key: str) -> None:
        """
        Initialize the Jackett service.

        Args:
            base_url: The base URL of the Jackett instance (e.g., http://localhost:9117)
            api_key: The API key for authentication
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = JACKETT_TIMEOUT

    def _get_api_url(self, endpoint: str) -> str:
        """Build the full API URL for an endpoint."""
        return urljoin(self.base_url, f"/api/v2.0/{endpoint}")

    async def test_connection(self) -> tuple[bool, str, int | None]:
        """
        Test the connection to the Jackett instance.

        Returns:
            Tuple of (success, message, indexer_count)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Get indexer configuration to verify connection
                url = self._get_api_url("indexers/all/results/torznab/api")
                params = {"apikey": self.api_key, "t": "caps"}

                response = await client.get(url, params=params)

                if response.status_code == 200:
                    # Try to get indexer count
                    indexer_count = await self._get_indexer_count(client)
                    return True, "Connection successful", indexer_count
                elif response.status_code == 401:
                    return False, "Invalid API key", None
                else:
                    return False, f"Connection failed: HTTP {response.status_code}", None

        except httpx.TimeoutException:
            return False, "Connection timed out", None
        except httpx.ConnectError:
            return False, "Could not connect to Jackett server", None
        except Exception as e:
            logger.exception("Error testing Jackett connection")
            return False, f"Connection error: {str(e)}", None

    async def _get_indexer_count(self, client: httpx.AsyncClient) -> int | None:
        """Get the number of configured indexers via the Torznab capability endpoint.

        Uses ``t=indexers`` so the request authenticates with the API key. The
        admin-password-protected ``/api/v2.0/indexers`` JSON endpoint is unsuitable
        because it 302s to the login UI when an admin password is set.
        """
        try:
            url = self._get_api_url("indexers/all/results/torznab/api")
            params = {
                "apikey": self.api_key,
                "t": "indexers",
                "configured": "true",
            }
            response = await client.get(url, params=params)

            if response.status_code != 200:
                return None

            return len(self._parse_indexers_xml(response.text))
        except Exception:
            return None

    async def get_indexer_count(self) -> int | None:
        """
        Get the number of configured indexers.

        Returns:
            Number of configured indexers, or None if unable to determine
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                return await self._get_indexer_count(client)
        except Exception:
            return None

    async def get_indexers(self) -> list[IndexerInfo]:
        """
        Get the list of configured indexers on this Jackett instance.

        Uses Jackett's Torznab ``t=indexers`` endpoint (authenticated by API key)
        rather than ``/api/v2.0/indexers``, which is gated by the admin password
        and redirects to the login UI when one is set.

        Returns:
            List of IndexerInfo objects for indexers that have been configured.
        """
        indexers: list[IndexerInfo] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
                url = self._get_api_url("indexers/all/results/torznab/api")
                params = {
                    "apikey": self.api_key,
                    "t": "indexers",
                    "configured": "true",
                }
                response = await client.get(url, params=params)

                if response.status_code != 200:
                    logger.warning(f"Jackett get_indexers failed: HTTP {response.status_code}")
                    return indexers

                indexers = self._parse_indexers_xml(response.text)
        except httpx.TimeoutException:
            logger.warning("Jackett get_indexers request timed out")
        except Exception:
            logger.exception("Error fetching Jackett indexers")

        return sorted(indexers, key=lambda i: i.name.lower())

    @staticmethod
    def _parse_indexers_xml(xml_content: str) -> list[IndexerInfo]:
        """Parse the ``t=indexers`` Torznab XML response into IndexerInfo objects."""
        import xml.etree.ElementTree as ET

        indexers: list[IndexerInfo] = []
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.error(f"Failed to parse Jackett indexers XML: {e}")
            return indexers

        for entry in root.iter("indexer"):
            indexer_id = entry.get("id")
            if not indexer_id:
                continue
            configured_attr = (entry.get("configured") or "").strip().lower()
            if configured_attr and configured_attr != "true":
                continue
            title = entry.findtext("title") or indexer_id
            type_text = entry.findtext("type")
            indexers.append(
                IndexerInfo(
                    id=str(indexer_id),
                    name=str(title),
                    type=str(type_text) if type_text else None,
                    enabled=True,
                )
            )
        return indexers

    async def get_latest(
        self,
        instance_name: str = "Jackett",
        indexer_ids: list[str] | None = None,
        category: SearchCategory = SearchCategory.ALL,
    ) -> list[SearchResult]:
        """
        Fetch the latest releases from one or more indexers.

        Implemented as a Torznab ``t=search&q=`` call (empty query), which is
        the same path Jackett uses for its RSS feed. Indexers that don't
        support browsing return an empty list; indexers that do return their
        most recent releases.
        """
        return await self.search(
            query="",
            category=category,
            instance_name=instance_name,
            indexer_ids=indexer_ids,
        )

    async def search(
        self,
        query: str,
        category: SearchCategory = SearchCategory.ALL,
        instance_name: str = "Jackett",
        indexer_ids: list[str] | None = None,
    ) -> list[SearchResult]:
        """
        Search for torrents across all configured indexers, or a specific subset.

        Args:
            query: The search query
            category: Category to filter by
            instance_name: Name of this instance for result attribution
            indexer_ids: Optional list of Jackett indexer site IDs to limit the search to.
                         When None or empty, searches all configured indexers ("all").

        Returns:
            List of SearchResult objects
        """
        # When specific indexers are selected, fan out one request per indexer.
        # Jackett's torznab endpoint accepts a single indexer slug per call.
        if indexer_ids:
            tasks = [
                self._search_single_indexer(idx, query, category, instance_name)
                for idx in indexer_ids
            ]
            grouped = await asyncio.gather(*tasks, return_exceptions=True)
            aggregated: list[SearchResult] = []
            for group in grouped:
                if isinstance(group, list):
                    aggregated.extend(group)
            return aggregated

        return await self._search_single_indexer("all", query, category, instance_name)

    async def _search_single_indexer(
        self,
        indexer_slug: str,
        query: str,
        category: SearchCategory,
        instance_name: str,
    ) -> list[SearchResult]:
        """Run a search against a single Jackett indexer (or 'all')."""
        results: list[SearchResult] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = self._get_api_url(f"indexers/{indexer_slug}/results/torznab/api")
                params: dict[str, Any] = {
                    "apikey": self.api_key,
                    "t": "search",
                    "q": query,
                }

                category_ids = CATEGORY_MAPPINGS.get(category)
                if category_ids:
                    params["cat"] = ",".join(str(c) for c in category_ids)

                response = await client.get(url, params=params)

                if response.status_code != 200:
                    logger.warning(
                        f"Jackett search failed for indexer '{indexer_slug}': "
                        f"HTTP {response.status_code}"
                    )
                    return results

                results = parse_torznab_response(
                    response.text,
                    instance_name=instance_name,
                    source_type="jackett",
                )
        except httpx.TimeoutException:
            logger.warning(f"Jackett search timed out for indexer '{indexer_slug}', query: {query}")
        except Exception as e:
            logger.exception(f"Error searching Jackett indexer '{indexer_slug}': {e}")
        return results
