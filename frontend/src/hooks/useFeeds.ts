import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { feedsApi } from '../api'
import { Feed, FeedCreate, FeedItemListParams, FeedUpdate } from '../types'
import { getFeedLastViewed, subscribeFeedLastViewed } from '../utils'

export const feedKeys = {
  all: ['feeds'] as const,
  list: () => [...feedKeys.all, 'list'] as const,
  detail: (id: number) => [...feedKeys.all, 'detail', id] as const,
  fetched: (id: number) => [...feedKeys.all, 'fetched', id] as const,
  items: (id: number, params?: FeedItemListParams) =>
    [...feedKeys.all, 'items', id, params ?? {}] as const,
  newCount: (id: number, since: number) => [...feedKeys.all, 'newCount', id, since] as const,
}

export function useFeeds() {
  return useQuery({
    queryKey: feedKeys.list(),
    queryFn: () => feedsApi.list(),
    placeholderData: (previous) => previous,
  })
}

export function useFeed(id: number | null) {
  return useQuery({
    queryKey: feedKeys.detail(id ?? -1),
    queryFn: () => feedsApi.get(id as number),
    enabled: id !== null,
  })
}

export function useCreateFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: FeedCreate) => feedsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all })
      toast.success('Feed created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create feed')
    },
  })
}

export function useUpdateFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FeedUpdate }) =>
      feedsApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all })
      toast.success('Feed updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update feed')
    },
  })
}

export function useDeleteFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => feedsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedKeys.all })
      toast.success('Feed deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete feed')
    },
  })
}

/**
 * Fetches the latest items for the given feed via POST /feeds/:id/fetch.
 *
 * Disabled by default; the FeedsPage triggers it when a feed is selected
 * or when the user clicks Refresh. Results live in the cache so switching
 * between feeds doesn't lose previously fetched output.
 */
export function useFeedFetch(id: number | null) {
  return useQuery({
    queryKey: feedKeys.fetched(id ?? -1),
    queryFn: () => feedsApi.fetch(id as number),
    enabled: id !== null,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * Reads the persisted feed-item history.
 *
 * Polls in the background every 30 seconds so newly arriving items from
 * the FeedPoller surface without the user clicking refresh. ``placeholderData``
 * keeps the previous page visible while filter/sort changes are in flight.
 */
export function useFeedItems(id: number | null, params: FeedItemListParams) {
  return useQuery({
    queryKey: feedKeys.items(id ?? -1, params),
    queryFn: () => feedsApi.items(id as number, params),
    enabled: id !== null,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  })
}

/**
 * Returns, keyed by feed id, the number of items first seen since the user
 * last opened that feed — the value rendered as a "NEW" badge in the feeds
 * sidebar. Feeds the user has never opened are omitted (no badge). Re-runs
 * whenever a feed is opened so its badge clears immediately, and polls in the
 * background so badges grow as the FeedPoller brings in new items.
 */
export function useFeedNewCounts(feeds: Feed[]): Record<number, number> {
  // Bump a counter whenever a feed is opened so the `since` cutoffs below are
  // recomputed from the freshly-persisted "last viewed" timestamps.
  const [, setRevision] = useState(0)
  useEffect(() => subscribeFeedLastViewed(() => setRevision((r) => r + 1)), [])

  const results = useQueries({
    queries: feeds.map((feed) => {
      const since = getFeedLastViewed(feed.id)
      return {
        queryKey: feedKeys.newCount(feed.id, since),
        queryFn: () =>
          feedsApi
            .items(feed.id, { limit: 1, first_seen_after: new Date(since).toISOString() })
            .then((res) => res.total),
        enabled: since > 0,
        refetchInterval: 60_000,
        refetchOnWindowFocus: false,
      }
    }),
  })

  const counts: Record<number, number> = {}
  feeds.forEach((feed, idx) => {
    const count = results[idx]?.data
    if (typeof count === 'number' && count > 0) counts[feed.id] = count
  })
  return counts
}

export function useRefreshFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => feedsApi.refresh(id),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: [...feedKeys.all, 'items', id] })
      queryClient.invalidateQueries({ queryKey: [...feedKeys.all, 'newCount'] })
      queryClient.invalidateQueries({ queryKey: feedKeys.list() })
      const total = data.total
      toast.success(`Refreshed — ${total} item${total === 1 ? '' : 's'} in history`)
      const errorCount = data.source_errors?.length ?? 0
      if (errorCount > 0) {
        toast.error(
          `${errorCount} indexer${errorCount === 1 ? '' : 's'} returned an error — see details above`,
        )
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Refresh failed')
    },
  })
}
