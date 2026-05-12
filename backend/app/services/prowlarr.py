"""
Prowlarr API service for searching torrent indexers.

Prowlarr is an indexer manager/proxy that integrates with various
PVR apps and supports management of both torrent and usenet indexers.
"""

import asyncio
import hashlib
import logging
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin

import httpx

from app.schemas.search import (
    CATEGORY_MAPPINGS,
    IndexerError,
    IndexerInfo,
    SearchCategory,
    SearchResult,
)
from app.services.torznab import (
    http_error_message,
    parse_torznab_error,
    parse_torznab_response,
    rate_limit_message,
)

logger = logging.getLogger(__name__)

# Default timeout for Prowlarr API requests (seconds)
PROWLARR_TIMEOUT = 30


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
        self.timeout = PROWLARR_TIMEOUT

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

    async def get_indexers(self) -> list[IndexerInfo]:
        """
        Get the list of indexers configured on this Prowlarr instance.

        Returns:
            List of IndexerInfo objects.
        """
        indexers: list[IndexerInfo] = []
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = self._get_api_url("indexer")
                response = await client.get(url, headers=self._get_headers())
                if response.status_code != 200:
                    logger.warning(f"Prowlarr get_indexers failed: HTTP {response.status_code}")
                    return indexers

                payload = response.json()
                for entry in payload:
                    if not isinstance(entry, dict):
                        continue
                    indexer_id = entry.get("id")
                    name = entry.get("name")
                    if indexer_id is None or not name:
                        continue
                    privacy = entry.get("privacy") or entry.get("protocol")
                    indexers.append(
                        IndexerInfo(
                            id=str(indexer_id),
                            name=str(name),
                            type=str(privacy) if privacy else None,
                            enabled=bool(entry.get("enable", True)),
                        )
                    )
        except httpx.TimeoutException:
            logger.warning("Prowlarr get_indexers request timed out")
        except Exception:
            logger.exception("Error fetching Prowlarr indexers")

        return sorted(indexers, key=lambda i: i.name.lower())

    async def get_latest(
        self,
        instance_name: str = "Prowlarr",
        indexer_ids: list[str] | None = None,
        category: SearchCategory = SearchCategory.ALL,
    ) -> tuple[list[SearchResult], list[IndexerError]]:
        """
        Fetch the latest releases from a set of indexers.

        Hits the per-indexer Newznab passthrough at ``/{indexerId}/api?t=search``
        — the same path Prowlarr uses for RSS Sync — once per indexer. This
        is preferred over the unified ``/api/v1/search`` endpoint for feed
        browsing because:

        * the passthrough is the canonical "browse latest" call for the
          underlying tracker, and behaves consistently with what RSS-aware
          clients expect;
        * Prowlarr enforces query/disabled-indexer limits up front and
          returns 429 with ``Retry-After``, surfacing throttling rather
          than silently dropping results;
        * if every indexer is unavailable, each request returns an empty
          list independently instead of failing the whole batch with HTTP
          400 (the unified endpoint's ``interactiveSearch=true`` path).

        ``indexer_ids`` must contain numeric Prowlarr indexer IDs; non-numeric
        entries are dropped (Prowlarr's route is ``{id:int}``). When the
        list is empty after filtering, ``([], [])`` is returned.

        Returns ``(results, errors)`` where ``errors`` lists per-indexer
        failures (rate limits, disabled indexers, timeouts, ...). Each error's
        ``indexer`` field holds the numeric Prowlarr id as a string; callers
        with the friendly display name should map it for presentation.
        """
        if not indexer_ids:
            return [], []

        numeric_ids = [int(idx) for idx in indexer_ids if str(idx).isdigit()]
        if not numeric_ids:
            return [], []

        tasks = [
            self._fetch_latest_one_indexer(idx, category, instance_name) for idx in numeric_ids
        ]
        grouped = await asyncio.gather(*tasks, return_exceptions=True)

        aggregated: list[SearchResult] = []
        errors: list[IndexerError] = []
        for outcome in grouped:
            if isinstance(outcome, tuple):
                results, error = outcome
                aggregated.extend(results)
                if error is not None:
                    errors.append(error)
        return aggregated, errors

    async def _fetch_latest_one_indexer(
        self,
        indexer_id: int,
        category: SearchCategory,
        instance_name: str,
    ) -> tuple[list[SearchResult], IndexerError | None]:
        """
        Hit Prowlarr's per-indexer Newznab passthrough for a single indexer.

        Returns ``(results, error)`` — ``error`` is ``None`` on success, or an
        ``IndexerError`` describing why this indexer produced nothing (HTTP 429
        rate limit, an indexer Prowlarr has disabled after repeated failures —
        which surfaces as a Torznab ``<error>`` body — a timeout, etc.).
        """
        results: list[SearchResult] = []

        def _err(message: str) -> IndexerError:
            return IndexerError(
                source=instance_name,
                source_type="prowlarr",
                indexer=str(indexer_id),
                message=message,
            )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = urljoin(self.base_url, f"/{indexer_id}/api")
                params: dict[str, Any] = {
                    "apikey": self.api_key,
                    "t": "search",
                    "q": "",
                    "extended": "1",
                }
                category_ids = CATEGORY_MAPPINGS.get(category)
                if category_ids:
                    params["cat"] = ",".join(str(c) for c in category_ids)

                response = await client.get(url, params=params)

                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    logger.warning(
                        f"Prowlarr indexer {indexer_id} rate-limited "
                        f"(Retry-After: {retry_after or '?'})"
                    )
                    return results, _err(rate_limit_message(retry_after))
                if response.status_code != 200:
                    message = http_error_message(response)
                    logger.warning(
                        f"Prowlarr Newznab passthrough for indexer {indexer_id}: {message}"
                    )
                    return results, _err(message)

                torznab_error = parse_torznab_error(response.text)
                if torznab_error:
                    logger.warning(
                        f"Prowlarr Newznab passthrough for indexer {indexer_id}: {torznab_error}"
                    )
                    return results, _err(torznab_error)

                results = parse_torznab_response(
                    response.text,
                    instance_name=instance_name,
                    source_type="prowlarr",
                    fallback_indexer=str(indexer_id),
                )
        except httpx.TimeoutException:
            logger.warning(f"Prowlarr Newznab passthrough timed out for indexer {indexer_id}")
            return results, _err("Request timed out")
        except Exception as exc:
            logger.exception(f"Error fetching latest from Prowlarr indexer {indexer_id}")
            return results, _err(str(exc) or exc.__class__.__name__)
        return results, None

    async def search(
        self,
        query: str,
        category: SearchCategory = SearchCategory.ALL,
        instance_name: str = "Prowlarr",
        indexer_ids: list[str] | None = None,
    ) -> tuple[list[SearchResult], list[IndexerError]]:
        """
        Search for torrents across all configured indexers, or a specific subset.

        Args:
            query: The search query
            category: Category to filter by
            instance_name: Name of this instance for result attribution
            indexer_ids: Optional list of Prowlarr indexer IDs to limit the search to.

        Returns:
            ``(results, errors)``. ``errors`` carries instance-level failures
            (HTTP 429 on the unified endpoint, timeouts, connection errors) plus
            one entry per requested indexer Prowlarr has auto-disabled — the
            unified ``/api/v1/search`` silently omits disabled indexers, so we
            cross-reference ``/api/v1/indexerstatus`` to surface them.
        """
        results: list[SearchResult] = []
        errors: list[IndexerError] = []

        def _instance_err(message: str) -> IndexerError:
            return IndexerError(
                source=instance_name, source_type="prowlarr", indexer=None, message=message
            )

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

                # Limit search to specific indexers when requested
                if indexer_ids:
                    params["indexerIds"] = [int(idx) for idx in indexer_ids if str(idx).isdigit()]

                response = await client.get(
                    url,
                    headers=self._get_headers(),
                    params=params,
                )

                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    logger.warning(
                        f"Prowlarr search rate-limited (Retry-After: {retry_after or '?'})"
                    )
                    return results, [_instance_err(rate_limit_message(retry_after))]
                if response.status_code != 200:
                    message = http_error_message(response)
                    logger.warning(f"Prowlarr search failed: {message}")
                    return results, [_instance_err(message)]

                # Parse JSON response
                data = response.json()
                results = self._parse_search_response(data, instance_name)

                try:
                    errors.extend(
                        await self._collect_disabled_indexer_errors(
                            client, instance_name, indexer_ids
                        )
                    )
                except Exception:
                    logger.debug("Prowlarr indexer-status check failed", exc_info=True)

        except httpx.TimeoutException:
            logger.warning(f"Prowlarr search timed out for query: {query}")
            return results, [_instance_err("Request timed out")]
        except Exception as e:
            logger.exception(f"Error searching Prowlarr: {e}")
            return results, [_instance_err(str(e) or e.__class__.__name__)]

        return results, errors

    async def _collect_disabled_indexer_errors(
        self,
        client: httpx.AsyncClient,
        instance_name: str,
        indexer_ids: list[str] | None,
    ) -> list[IndexerError]:
        """
        Return an ``IndexerError`` for each indexer Prowlarr currently has
        backed off (``disabledTill`` in the future).

        When ``indexer_ids`` is given, only those indexers are reported;
        otherwise every currently-disabled indexer is reported, since any of
        them would silently shrink an "all indexers" search.
        """
        status_resp = await client.get(
            self._get_api_url("indexerstatus"), headers=self._get_headers()
        )
        if status_resp.status_code != 200:
            return []
        statuses = status_resp.json()
        if not isinstance(statuses, list) or not statuses:
            return []

        now = datetime.now(UTC)
        disabled_ids: list[int] = []
        for entry in statuses:
            if not isinstance(entry, dict):
                continue
            idx_id = entry.get("indexerId")
            disabled_till = entry.get("disabledTill")
            if idx_id is None or not disabled_till:
                continue
            try:
                until = datetime.fromisoformat(str(disabled_till).replace("Z", "+00:00"))
            except ValueError:
                continue
            if until.tzinfo is None:
                until = until.replace(tzinfo=UTC)
            if until <= now:
                continue
            disabled_ids.append(int(idx_id))

        if not disabled_ids:
            return []

        requested: set[int] | None = None
        if indexer_ids:
            requested = {int(i) for i in indexer_ids if str(i).isdigit()}
        relevant_ids = [i for i in disabled_ids if requested is None or i in requested]
        if not relevant_ids:
            return []

        names: dict[int, str] = {}
        try:
            ind_resp = await client.get(self._get_api_url("indexer"), headers=self._get_headers())
            if ind_resp.status_code == 200:
                for entry in ind_resp.json():
                    if (
                        isinstance(entry, dict)
                        and entry.get("id") is not None
                        and entry.get("name")
                    ):
                        names[int(entry["id"])] = str(entry["name"])
        except Exception:
            logger.debug("Prowlarr indexer-name lookup failed", exc_info=True)

        return [
            IndexerError(
                source=instance_name,
                source_type="prowlarr",
                indexer=names.get(idx_id, str(idx_id)),
                message="Disabled by Prowlarr after repeated failures",
            )
            for idx_id in relevant_ids
        ]

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

        # Freeleech detection via Prowlarr's downloadVolumeFactor field.
        # 0.0 = freeleech, 0.5 = half-leech, 1.0 = normal.
        download_volume_factor: float | None = None
        raw_factor = item.get("downloadVolumeFactor")
        if raw_factor is not None:
            try:
                download_volume_factor = float(raw_factor)
            except (TypeError, ValueError):
                download_volume_factor = None
        freeleech = download_volume_factor is not None and download_volume_factor == 0.0

        # Indexers that don't expose downloadVolumeFactor often signal freeleech
        # via Prowlarr's indexerFlags array (e.g. ["freeleech", "internal"]).
        if not freeleech:
            flags = item.get("indexerFlags") or []
            if isinstance(flags, list):
                for flag in flags:
                    if isinstance(flag, str) and "freeleech" in flag.lower():
                        freeleech = True
                        if download_volume_factor is None:
                            download_volume_factor = 0.0
                        break

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
            freeleech=freeleech,
            download_volume_factor=download_volume_factor,
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
