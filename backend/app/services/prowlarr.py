"""
Prowlarr API service for searching torrent indexers.

Prowlarr is an indexer manager/proxy that integrates with various
PVR apps and supports management of both torrent and usenet indexers.
"""

import hashlib
import logging
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import settings
from app.schemas.search import CATEGORY_MAPPINGS, SearchCategory, SearchResult

logger = logging.getLogger(__name__)


class ProwlarrService:
    """Service for interacting with Prowlarr API."""

    def __init__(self, base_url: str, api_key: str) -> None:
        """
        Initialize the Prowlarr service.

        Args:
            base_url: The base URL of the Prowlarr instance (e.g., http://localhost:9696)
            api_key: The API key for authentication
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = settings.PROWLARR_TIMEOUT

    def _get_headers(self) -> dict[str, str]:
        """Get headers for API requests."""
        return {
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        }

    def _get_api_url(self, endpoint: str) -> str:
        """Build the full API URL for an endpoint."""
        return urljoin(self.base_url, f"/api/v1/{endpoint}")

    async def test_connection(self) -> tuple[bool, str, int | None]:
        """
        Test the connection to the Prowlarr instance.

        Returns:
            Tuple of (success, message, indexer_count)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Get system status to verify connection
                url = self._get_api_url("system/status")
                response = await client.get(url, headers=self._get_headers())

                if response.status_code == 200:
                    # Get indexer count
                    indexer_count = await self._get_indexer_count(client)
                    return True, "Connection successful", indexer_count
                elif response.status_code == 401:
                    return False, "Invalid API key", None
                else:
                    return False, f"Connection failed: HTTP {response.status_code}", None

        except httpx.TimeoutException:
            return False, "Connection timed out", None
        except httpx.ConnectError:
            return False, "Could not connect to Prowlarr server", None
        except Exception as e:
            logger.exception("Error testing Prowlarr connection")
            return False, f"Connection error: {str(e)}", None

    async def _get_indexer_count(self, client: httpx.AsyncClient) -> int | None:
        """Get the number of configured indexers."""
        try:
            url = self._get_api_url("indexer")
            response = await client.get(url, headers=self._get_headers())

            if response.status_code == 200:
                indexers = response.json()
                # Count enabled indexers
                return len([i for i in indexers if i.get("enable", False)])
            return None
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

    async def search(
        self,
        query: str,
        category: SearchCategory = SearchCategory.ALL,
        instance_name: str = "Prowlarr",
    ) -> list[SearchResult]:
        """
        Search for torrents across all configured indexers.

        Args:
            query: The search query
            category: Category to filter by
            instance_name: Name of this instance for result attribution

        Returns:
            List of SearchResult objects
        """
        results: list[SearchResult] = []

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = self._get_api_url("search")
                params: dict[str, Any] = {
                    "query": query,
                    "type": "search",
                }

                # Add category filter if not "All"
                category_ids = CATEGORY_MAPPINGS.get(category)
                if category_ids:
                    params["categories"] = category_ids

                response = await client.get(
                    url,
                    headers=self._get_headers(),
                    params=params,
                )

                if response.status_code != 200:
                    logger.warning(f"Prowlarr search failed: HTTP {response.status_code}")
                    return results

                # Parse JSON response
                data = response.json()
                results = self._parse_search_response(data, instance_name)

        except httpx.TimeoutException:
            logger.warning(f"Prowlarr search timed out for query: {query}")
        except Exception as e:
            logger.exception(f"Error searching Prowlarr: {e}")

        return results

    def _parse_search_response(
        self,
        data: list[dict[str, Any]],
        instance_name: str,
    ) -> list[SearchResult]:
        """
        Parse Prowlarr search response into SearchResult objects.

        Args:
            data: The JSON response from Prowlarr
            instance_name: Name of the instance for attribution

        Returns:
            List of SearchResult objects
        """
        results: list[SearchResult] = []

        for item in data:
            try:
                result = self._parse_item(item, instance_name)
                if result:
                    results.append(result)
            except Exception as e:
                logger.debug(f"Error parsing Prowlarr result item: {e}")
                continue

        return results

    def _parse_item(self, item: dict[str, Any], instance_name: str) -> SearchResult | None:
        """Parse a single item from the Prowlarr response."""
        title = item.get("title")
        if not title:
            return None

        # Get size
        size = item.get("size", 0) or 0

        # Get seeders/leechers
        seeders = item.get("seeders", 0) or 0
        leechers = item.get("leechers", 0) or 0

        # Get date
        pub_date = None
        pub_date_str = item.get("publishDate")
        if pub_date_str:
            try:
                # Prowlarr uses ISO format
                pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
            except Exception:
                pass

        # Get category
        category = "Other"
        categories = item.get("categories", [])
        if categories:
            # Use the first category name
            first_cat = categories[0] if categories else {}
            category = first_cat.get("name", "Other") if isinstance(first_cat, dict) else "Other"

        # Get indexer name
        indexer = item.get("indexer", "Unknown")

        # Get magnet link
        magnet_link = item.get("magnetUrl")

        # Get torrent URL
        torrent_url = item.get("downloadUrl")

        # Get info URL
        info_url = item.get("infoUrl") or item.get("guid")

        # Generate unique ID
        guid = item.get("guid", "")
        unique_str = f"{instance_name}:{indexer}:{guid}:{title}"
        result_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

        return SearchResult(
            id=result_id,
            title=title,
            source=instance_name,
            source_type="prowlarr",
            indexer=indexer,
            size=size,
            size_formatted=self._format_size(size),
            seeders=seeders,
            leechers=leechers,
            date=pub_date,
            category=category,
            magnet_link=magnet_link,
            torrent_url=torrent_url,
            info_url=info_url,
        )

    @staticmethod
    def _format_size(size_bytes: int) -> str:
        """Format size in bytes to human-readable string."""
        if size_bytes == 0:
            return "0 B"

        units = ["B", "KB", "MB", "GB", "TB"]
        unit_index = 0
        size = float(size_bytes)

        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1

        return f"{size:.1f} {units[unit_index]}"
