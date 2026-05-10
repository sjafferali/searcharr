"""
Helpers for bookmark de-duplication and persistence.
"""

import re
from urllib.parse import parse_qs, urlsplit

_INFOHASH_RE = re.compile(r"urn:bt[mi]h:([0-9a-fA-F]{32,64})")


def compute_dedup_key(
    *,
    magnet_link: str | None,
    torrent_url: str | None,
    info_url: str | None,
) -> str | None:
    """
    Derive a stable identity for a search result.

    Preference order:
    1. ``magnet:?xt=urn:btih:HASH`` info-hash (lowercased) — the canonical
       BitTorrent identity, identical across trackers and indexers.
    2. ``torrent_url`` — direct .torrent URL, normalized to lowercase scheme/host.
    3. ``info_url`` — same normalization.

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

    if torrent_url:
        normalized = _normalize_url(torrent_url)
        if normalized:
            return f"url:{normalized}"

    if info_url:
        normalized = _normalize_url(info_url)
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
