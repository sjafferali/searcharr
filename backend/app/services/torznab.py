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
from datetime import datetime
from typing import Any

from app.schemas.search import SearchResult

logger = logging.getLogger(__name__)

TORZNAB_NS = {"torznab": "http://torznab.com/schemas/2015/feed"}


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
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
    ):
        try:
            return datetime.strptime(pub_date_str.strip(), fmt)
        except ValueError:
            continue
    return None


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
