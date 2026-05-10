/**
 * Mirror of the server's compute_dedup_key (backend/app/services/bookmark.py).
 *
 * Given a result's identifying fields, return the same stable identity the
 * server would produce. Used to map current-search results to existing
 * bookmark ids in the lookup response.
 */
export function computeDedupKey({
  magnet_link,
  torrent_url,
  info_url,
}: {
  magnet_link?: string | null
  torrent_url?: string | null
  info_url?: string | null
}): string | null {
  if (magnet_link) {
    const m = magnet_link.match(/urn:bt[mi]h:([0-9a-fA-F]{32,64})/)
    if (m) return `btih:${m[1].toLowerCase()}`
    try {
      const url = new URL(magnet_link)
      for (const xt of url.searchParams.getAll('xt')) {
        const xm = xt.match(/urn:bt[mi]h:([0-9a-fA-F]{32,64})/)
        if (xm) return `btih:${xm[1].toLowerCase()}`
      }
    } catch {
      // ignore parse errors
    }
  }

  const normalize = (raw: string): string | null => {
    try {
      const u = new URL(raw)
      if (!u.protocol || !u.host) return null
      const scheme = u.protocol.replace(':', '').toLowerCase()
      const host = u.host.toLowerCase()
      const path = u.pathname || '/'
      const query = u.search // includes leading '?'
      return `url:${scheme}://${host}${path}${query}`
    } catch {
      return null
    }
  }

  if (torrent_url) {
    const k = normalize(torrent_url)
    if (k) return k
  }
  if (info_url) {
    const k = normalize(info_url)
    if (k) return k
  }
  return null
}
