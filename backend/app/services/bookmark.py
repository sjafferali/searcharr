"""
Helpers for bookmark and feed-item de-duplication.
"""

import re
from urllib.parse import parse_qs, urlsplit

_INFOHASH_RE = re.compile(r"urn:bt[mi]h:([0-9a-fA-F]{32,64})")


def compute_dedup_key(
    *,
    magnet_link: str | None,
    torrent_url: str | None,
    info_url: str | None,
    source: str | None = None,
    indexer: str | None = None,
    title: str | None = None,
    size: int | None = None,
) -> str | None:
    """
    Derive a stable identity for a search result.

    Preference order:
    1. ``magnet:?xt=urn:btih:HASH`` info-hash (lowercased) — the canonical
       BitTorrent identity, identical across trackers and indexers.
    2. ``sig:SIZE|SOURCE|INDEXER|TITLE`` — a content signature derived from the
       release's own metadata. Stable across polls even when the indexer wraps
       its download/details links in single-use tokens (Jackett's encrypted
       ``path=`` blob, Prowlarr's ``link=`` blob, per-request session keys),
       which makes the URL forms below change on every fetch.
    3. ``info_url`` — the details/comments page, normalized to lowercase
       scheme/host. Usually the most stable URL an item carries.
    4. ``torrent_url`` — the (often proxied, often single-use) download URL,
       same normalization. Last resort.

    Returns ``None`` when none of the inputs yield a usable identity.
    """
    if magnet_link:
        match = _INFOHASH_RE.search(magnet_link)
        if match:
            return f"btih:{match.group(1).lower()}"
        # Fall back to xt parameter parsing for unusual encodings.
        try:
            qs = parse_qs(urlsplit(magnet_link).query)
            for xt in qs.get("xt", []):
                m = _INFOHASH_RE.search(xt)
                if m:
                    return f"btih:{m.group(1).lower()}"
        except Exception:
            pass

    title_s = (title or "").strip()
    source_s = (source or "").strip()
    indexer_s = (indexer or "").strip()
    if title_s and source_s and indexer_s:
        size_part = str(int(size)) if isinstance(size, int) else "0"
        # Title comes last because it's the only part that may itself contain a
        # ``|`` — keeping it at the end keeps the field boundaries unambiguous.
        return f"sig:{size_part}|{source_s}|{indexer_s}|{title_s}"

    if info_url:
        normalized = _normalize_url(info_url)
        if normalized:
            return f"url:{normalized}"

    if torrent_url:
        normalized = _normalize_url(torrent_url)
        if normalized:
            return f"url:{normalized}"

    return None


def _normalize_url(url: str) -> str | None:
    try:
        parts = urlsplit(url.strip())
    except Exception:
        return None
    if not parts.scheme or not parts.netloc:
        return None
    scheme = parts.scheme.lower()
    netloc = parts.netloc.lower()
    path = parts.path or "/"
    query = parts.query
    rebuilt = f"{scheme}://{netloc}{path}"
    if query:
        rebuilt += f"?{query}"
    return rebuilt
