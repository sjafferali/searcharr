"""
Jackett API service for searching torrent indexers.

Jackett is a proxy server that translates queries from apps into
tracker-site-specific HTTP queries, fetching results, and parsing them.
"""

import logging
from datetime import datetime
from typing import Any
from urllib.parse import urljoin

import httpx

from app.config import settings
from app.schemas.search import CATEGORY_MAPPINGS, SearchCategory, SearchResult

logger = logging.getLogger(__name__)


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
        self.timeout = settings.JACKETT_TIMEOUT

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
        """Get the number of configured indexers."""
        try:
            # Jackett's indexer list endpoint
            url = urljoin(self.base_url, "/api/v2.0/indexers")
            response = await client.get(url, params={"apikey": self.api_key})

            if response.status_code == 200:
                indexers = response.json()
                # Count only configured (non-aggregate) indexers
                return len([i for i in indexers if i.get("configured", False)])
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
        instance_name: str = "Jackett",
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
                url = self._get_api_url("indexers/all/results/torznab/api")
                params: dict[str, Any] = {
                    "apikey": self.api_key,
                    "t": "search",
                    "q": query,
                }

                # Add category filter if not "All"
                category_ids = CATEGORY_MAPPINGS.get(category)
                if category_ids:
                    params["cat"] = ",".join(str(c) for c in category_ids)

                response = await client.get(url, params=params)

                if response.status_code != 200:
                    logger.warning(f"Jackett search failed: HTTP {response.status_code}")
                    return results

                # Parse XML response (Torznab format)
                results = self._parse_torznab_response(
                    response.text,
                    instance_name=instance_name,
                )

        except httpx.TimeoutException:
            logger.warning(f"Jackett search timed out for query: {query}")
        except Exception as e:
            logger.exception(f"Error searching Jackett: {e}")

        return results

    def _parse_torznab_response(
        self,
        xml_content: str,
        instance_name: str,
    ) -> list[SearchResult]:
        """
        Parse Torznab XML response into SearchResult objects.

        Args:
            xml_content: The XML response from Jackett
            instance_name: Name of the instance for attribution

        Returns:
            List of SearchResult objects
        """
        import xml.etree.ElementTree as ET

        results: list[SearchResult] = []

        try:
            root = ET.fromstring(xml_content)

            # Find the channel containing items
            channel = root.find("channel")
            if channel is None:
                return results

            for item in channel.findall("item"):
                try:
                    result = self._parse_item(item, instance_name)
                    if result:
                        results.append(result)
                except Exception as e:
                    logger.debug(f"Error parsing Jackett result item: {e}")
                    continue

        except ET.ParseError as e:
            logger.error(f"Failed to parse Jackett XML response: {e}")

        return results

    def _parse_item(self, item: Any, instance_name: str) -> SearchResult | None:
        """Parse a single item from the Torznab response."""
        import hashlib
        import xml.etree.ElementTree as ET

        # Torznab namespace for extended attributes
        torznab_ns = {"torznab": "http://torznab.com/schemas/2015/feed"}

        title = item.findtext("title")
        if not title:
            return None

        # Get size
        size = 0
        size_elem = item.find("size")
        if size_elem is not None and size_elem.text:
            size = int(size_elem.text)
        else:
            # Try torznab:attr with name="size"
            for attr in item.findall("torznab:attr", torznab_ns):
                if attr.get("name") == "size":
                    size = int(attr.get("value", 0))
                    break

        # Get seeders/leechers
        seeders = 0
        leechers = 0
        for attr in item.findall("torznab:attr", torznab_ns):
            name = attr.get("name")
            value = attr.get("value", "0")
            if name == "seeders":
                seeders = int(value)
            elif name == "peers":
                leechers = max(0, int(value) - seeders)

        # Get date
        pub_date = None
        pub_date_str = item.findtext("pubDate")
        if pub_date_str:
            try:
                # Try common date formats
                for fmt in [
                    "%a, %d %b %Y %H:%M:%S %z",
                    "%Y-%m-%dT%H:%M:%S%z",
                    "%Y-%m-%d %H:%M:%S",
                ]:
                    try:
                        pub_date = datetime.strptime(pub_date_str.strip(), fmt)
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Get category
        category = "Other"
        category_elem = item.find("category")
        if category_elem is not None and category_elem.text:
            category = category_elem.text

        # Get indexer name
        indexer = item.findtext("jackettindexer") or "Unknown"

        # Get magnet link
        magnet_link = None
        for attr in item.findall("torznab:attr", torznab_ns):
            if attr.get("name") == "magneturl":
                magnet_link = attr.get("value")
                break

        # Get torrent URL
        torrent_url = None
        link = item.findtext("link")
        if link:
            torrent_url = link

        # Get info URL
        info_url = item.findtext("comments") or item.findtext("guid")

        # Generate unique ID
        unique_str = f"{instance_name}:{indexer}:{title}:{size}"
        result_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

        return SearchResult(
            id=result_id,
            title=title,
            source=instance_name,
            source_type="jackett",
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
