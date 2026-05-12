"""
Shared Torznab/Newznab XML parser.

Both Jackett and Prowlarr's per-indexer ``/{id}/api?t=search`` passthrough
return Torznab-format XML. This module is the single source of truth for
turning that XML into ``SearchResult`` objects, including freeleech
detection across the two slightly different conventions used by each
upstream:

* **Jackett** emits the indexer name in a ``<jackettindexer>`` element and
  bundles indexer flags into a single ``<torznab:attr name="tags">`` whose
  value is a comma-separated list (e.g. ``"freeleech, internal"``).
* **Prowlarr** emits the indexer name in ``<prowlarrindexer>`` and produces
  one ``<torznab:attr name="tag" value="freeleech"/>`` element per flag.

Freeleech is recognized in either shape, plus the standard
``<torznab:attr name="downloadvolumefactor" value="0"/>`` attribute when
present.
"""

import hashlib
import logging
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.schemas.search import SearchResult

logger = logging.getLogger(__name__)

# Lower bound for a believable torrent ``pubDate``. BitTorrent itself only
# dates to 2001, and any tracker that could index a release postdates that
# comfortably, so anything earlier is synthetic — typically an indexer that
# derived the date from a broken "X ago" relative string (we've seen years
# like 1084). Such dates are dropped so the feed shows "no date" rather than
# a nonsense "936 years ago".
_MIN_PLAUSIBLE_PUB_YEAR = 2000
# Indexers with a misconfigured timezone routinely report dates a few hours
# (occasionally a day) in the future; that's surfaced as-is. Anything beyond
# this is treated as garbage instead.
_MAX_PUB_FUTURE = timedelta(days=366)

# Accepted ``pubDate`` shapes, tried in order. ``%z`` matches ``Z``, ``+00:00``
# and ``+0000`` (Python 3.7+); the ``.%f`` variants cover feeds that include
# fractional seconds; the trailing tz-less forms are normalized to UTC below.
_PUB_DATE_FORMATS = (
    "%a, %d %b %Y %H:%M:%S %z",
    "%a, %d %b %Y %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f%z",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
)

TORZNAB_NS = {"torznab": "http://torznab.com/schemas/2015/feed"}


def rate_limit_message(retry_after: str | None) -> str:
    """Build a human-readable rate-limit message from a ``Retry-After`` header."""
    if retry_after:
        value = retry_after.strip()
        suffix = "s" if value.isdigit() else ""
        return f"Rate limited by the indexer — retry after {value}{suffix}"
    return "Rate limited by the indexer"


def http_error_message(response: httpx.Response) -> str:
    """
    Describe a non-2xx HTTP response as concisely as possible.

    Prefers a Torznab ``<error description=.../>`` body or a JSON ``message``
    field (Prowlarr's API error shape) over a bare status code.
    """
    body = response.text or ""
    torznab_desc = parse_torznab_error(body)
    if torznab_desc:
        return torznab_desc
    try:
        payload = response.json()
        if isinstance(payload, dict):
            msg = payload.get("message") or payload.get("error")
            if msg:
                return f"{msg} (HTTP {response.status_code})"
    except Exception:
        pass
    return f"HTTP {response.status_code}"


def parse_torznab_error(xml_content: str) -> str | None:
    """
    Return the description of a Torznab/Newznab ``<error>`` document, if the
    payload is one.

    Both Jackett and Prowlarr answer a failing indexer query with a body like
    ``<error code="100" description="Incorrect user credentials"/>`` (sometimes
    with a 2xx status, sometimes a 4xx/5xx). When the indexer Prowlarr is
    proxying has been auto-disabled after repeated failures, the description
    typically reads something like "Indexer is disabled due to recent failures".

    Returns ``None`` when the body isn't an error document (a normal RSS feed,
    HTML, malformed XML, etc.).
    """
    if not xml_content:
        return None
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError:
        return None
    # Tag may be namespace-qualified ("{...}error"); match on the local name.
    local_name = root.tag.rsplit("}", 1)[-1].lower()
    if local_name != "error":
        return None
    description = root.get("description") or root.get("Description")
    code = root.get("code") or root.get("Code")
    if description:
        return f"{description} (code {code})" if code else description
    return f"Indexer error (code {code})" if code else "Unknown indexer error"


def parse_torznab_response(
    xml_content: str,
    *,
    instance_name: str,
    source_type: str,
    fallback_indexer: str = "Unknown",
) -> list[SearchResult]:
    """
    Parse a Torznab/Newznab ``rss > channel > item`` document into results.

    ``fallback_indexer`` is used when neither ``<jackettindexer>`` nor
    ``<prowlarrindexer>`` is present on the item (which is the case for
    Prowlarr responses when the proxy stripped the field, or for minimally
    compliant indexers).
    """
    results: list[SearchResult] = []
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.error(f"Failed to parse Torznab XML response: {exc}")
        return results

    channel = root.find("channel")
    if channel is None:
        return results

    for item in channel.findall("item"):
        try:
            parsed = _parse_item(
                item,
                instance_name=instance_name,
                source_type=source_type,
                fallback_indexer=fallback_indexer,
            )
            if parsed:
                results.append(parsed)
        except Exception as exc:
            logger.debug(f"Error parsing Torznab item: {exc}")
            continue
    return results


def _parse_item(
    item: Any,
    *,
    instance_name: str,
    source_type: str,
    fallback_indexer: str,
) -> SearchResult | None:
    title = item.findtext("title")
    if not title:
        return None

    size = _extract_size(item)
    seeders, leechers, download_volume_factor, freeleech = _extract_peers_and_flags(item)
    pub_date = _extract_pub_date(item)

    category = "Other"
    category_elem = item.find("category")
    if category_elem is not None and category_elem.text:
        category = category_elem.text

    indexer = (
        item.findtext("jackettindexer") or item.findtext("prowlarrindexer") or fallback_indexer
    )

    magnet_link: str | None = None
    for attr in item.findall("torznab:attr", TORZNAB_NS):
        if attr.get("name") == "magneturl":
            magnet_link = attr.get("value")
            break

    torrent_url = item.findtext("link") or None
    info_url = item.findtext("comments") or item.findtext("guid")

    unique_str = f"{instance_name}:{indexer}:{title}:{size}"
    result_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

    return SearchResult(
        id=result_id,
        title=title,
        source=instance_name,
        source_type=source_type,
        indexer=indexer,
        size=size,
        size_formatted=_format_size(size),
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


def _extract_size(item: Any) -> int:
    size_elem = item.find("size")
    if size_elem is not None and size_elem.text:
        try:
            return int(size_elem.text)
        except (TypeError, ValueError):
            pass
    for attr in item.findall("torznab:attr", TORZNAB_NS):
        if attr.get("name") == "size":
            try:
                return int(attr.get("value", "0"))
            except (TypeError, ValueError):
                return 0
    return 0


def _extract_peers_and_flags(item: Any) -> tuple[int, int, float | None, bool]:
    seeders = 0
    leechers = 0
    download_volume_factor: float | None = None
    tag_values: list[str] = []
    tags_text = ""

    for attr in item.findall("torznab:attr", TORZNAB_NS):
        name = attr.get("name")
        value = attr.get("value", "")
        if name == "seeders":
            try:
                seeders = int(value)
            except (TypeError, ValueError):
                seeders = 0
        elif name == "peers":
            try:
                leechers = max(0, int(value) - seeders)
            except (TypeError, ValueError):
                leechers = 0
        elif name == "downloadvolumefactor":
            try:
                download_volume_factor = float(value)
            except (TypeError, ValueError):
                download_volume_factor = None
        elif name == "tag":
            tag_values.append(value.lower())
        elif name == "tags":
            tags_text = value.lower()

    freeleech = download_volume_factor is not None and download_volume_factor == 0.0

    if not freeleech:
        if any("freeleech" in t for t in tag_values) or "freeleech" in tags_text:
            freeleech = True
            if download_volume_factor is None:
                download_volume_factor = 0.0

    return seeders, leechers, download_volume_factor, freeleech


def _extract_pub_date(item: Any) -> datetime | None:
    pub_date_str = item.findtext("pubDate")
    if not pub_date_str:
        return None
    pub_date_str = pub_date_str.strip()
    parsed: datetime | None = None
    for fmt in _PUB_DATE_FORMATS:
        try:
            parsed = datetime.strptime(pub_date_str, fmt)
            break
        except ValueError:
            continue
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    if parsed.year < _MIN_PLAUSIBLE_PUB_YEAR or parsed > datetime.now(UTC) + _MAX_PUB_FUTURE:
        return None
    return parsed


def _format_size(size_bytes: int) -> str:
    """Format a byte count as a human-readable string."""
    if size_bytes == 0:
        return "0 B"
    units = ("B", "KB", "MB", "GB", "TB")
    unit_index = 0
    size = float(size_bytes)
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    return f"{size:.1f} {units[unit_index]}"
