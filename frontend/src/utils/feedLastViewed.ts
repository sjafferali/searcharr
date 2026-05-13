/**
 * Per-feed "last viewed" bookkeeping for the Feeds page.
 *
 * Each feed records the epoch-ms timestamp at which the user last opened its
 * history, persisted to localStorage so the "new since last visit" state
 * survives reloads and tab closes. A tiny pub-sub lets independent parts of
 * the page — the feed table and the sidebar's NEW-count badges — react the
 * moment a feed is opened.
 */

const STORAGE_PREFIX = 'feeds.lastViewed.'

const listeners = new Set<() => void>()

// The "new since" baseline captured the first time each feed is opened in
// this browser session. Held stable for the session so rows flagged NEW
// don't un-flag themselves while the feed is being viewed, even though the
// persisted "last viewed" value is bumped to the present on open.
const sessionBaselines = new Map<number, number>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Subscribe to "a feed was opened" notifications. Returns an unsubscribe fn. */
export function subscribeFeedLastViewed(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The persisted "last opened at" epoch-ms for a feed, or 0 if never opened. */
export function getFeedLastViewed(feedId: number): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${feedId}`)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

/**
 * The baseline a feed's items are judged "new" against — the same value the
 * feed table uses to flag NEW rows. Once a feed has been opened this session
 * it's the session baseline (the timestamp from *before* the open bumped it),
 * so the count stays put while the feed is being viewed; otherwise it's the
 * persisted "last opened" value. Returns 0 when the feed has never been
 * opened, since there's no reference point to call anything new.
 */
export function getFeedNewBaseline(feedId: number): number {
  const session = sessionBaselines.get(feedId)
  return session !== undefined ? session : getFeedLastViewed(feedId)
}

/**
 * Records that the feed has just been opened: persists ``Date.now()`` and
 * notifies subscribers. Returns the session baseline — the value that was
 * stored the first time this feed was opened this session — which the feed
 * table uses to decide which items count as NEW.
 */
export function markFeedViewed(feedId: number): number {
  let baseline = sessionBaselines.get(feedId)
  if (baseline === undefined) {
    baseline = getFeedLastViewed(feedId)
    sessionBaselines.set(feedId, baseline)
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${feedId}`, String(Date.now()))
    } catch {
      // ignore quota / private-mode write failures
    }
  }
  notify()
  return baseline
}
