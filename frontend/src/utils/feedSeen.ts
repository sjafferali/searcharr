/**
 * Per-feed "seen" bookkeeping for the Feeds page.
 *
 * The marker itself — ``seen_through`` plus a short history of earlier values —
 * lives on the server (``POST /feeds/:id/seen``), so NEW state is shared across
 * browsers and devices. This module holds the per-page-session view of it: the
 * baseline each feed was opened with, kept stable so rows flagged NEW don't
 * un-flag themselves while the feed is being viewed, even though the server's
 * marker has already advanced. A tiny pub-sub lets the feed table and the
 * sidebar's NEW-count badges react the moment a feed is opened.
 */

import { feedsApi } from '../api/feeds'

export interface FeedVisit {
  /** Epoch-ms that items are judged NEW against; 0 if the feed was never opened. */
  baseline: number
  /**
   * Epoch-ms cutoffs of earlier visits that had new items, newest first. Only
   * values older than ``baseline`` — each one widens the NEW window to bring
   * back a batch that was already marked seen.
   */
  history: number[]
}

// Pre-server versions kept the marker in localStorage under this prefix. It's
// consulted once per feed so upgrading doesn't wipe the current NEW state.
const LEGACY_STORAGE_PREFIX = 'feeds.lastViewed.'

const listeners = new Set<() => void>()

// One visit per feed per page session. The promise is cached (not just its
// result) so concurrent opens — React StrictMode's double effect, fast feed
// switching — share a single server call rather than racing a second one that
// would see the already-advanced marker.
const visitPromises = new Map<number, Promise<FeedVisit>>()
const visits = new Map<number, FeedVisit>()

function notify(): void {
  for (const listener of listeners) listener()
}

/** Subscribe to "a feed was opened" notifications. Returns an unsubscribe fn. */
export function subscribeFeedSeen(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function toMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

function takeLegacyLastViewed(feedId: number): number {
  if (typeof window === 'undefined') return 0
  try {
    const key = `${LEGACY_STORAGE_PREFIX}${feedId}`
    const raw = window.localStorage.getItem(key)
    window.localStorage.removeItem(key)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  } catch {
    return 0
  }
}

/**
 * Records that the feed has just been opened and resolves with this session's
 * visit. The first call per feed per page session tells the server to advance
 * its marker; later calls return the same visit, so re-opening a feed without
 * reloading keeps its NEW rows. Rejects if the server call fails (the next
 * open retries).
 */
export function beginFeedVisit(feedId: number): Promise<FeedVisit> {
  let promise = visitPromises.get(feedId)
  if (!promise) {
    promise = feedsApi
      .markSeen(feedId, true)
      .then((res) => {
        // Server had no marker yet: fall back to what this browser recorded
        // before the marker moved server-side.
        const legacy = takeLegacyLastViewed(feedId)
        const baseline = toMs(res.baseline) || legacy
        const history = res.seen_history.map(toMs).filter((ms) => ms > 0 && ms < baseline)
        const visit: FeedVisit = { baseline, history }
        visits.set(feedId, visit)
        notify()
        return visit
      })
      .catch((error: unknown) => {
        visitPromises.delete(feedId)
        throw error
      })
    visitPromises.set(feedId, promise)
  }
  return promise
}

/** This session's visit for a feed, or undefined if it hasn't been opened yet. */
export function getFeedVisit(feedId: number): FeedVisit | undefined {
  return visits.get(feedId)
}

/**
 * Advances the server's marker to now without starting a new visit. Called
 * whenever the items list refetches while the feed is on screen, so the next
 * visit's baseline excludes items that arrived (and were viewed) during this
 * one. Waits for the visit to be established first — touching earlier would
 * move the marker before its previous value had been captured as the baseline.
 */
export function touchFeedSeen(feedId: number): void {
  const promise = visitPromises.get(feedId)
  if (!promise) return
  promise
    .then(() => feedsApi.markSeen(feedId, false))
    .catch(() => {
      // Best-effort: a missed touch only means a few already-viewed items are
      // flagged NEW again next visit.
    })
}
