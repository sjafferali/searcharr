import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { bookmarksApi } from '../api'
import {
  Bookmark,
  BookmarkCreate,
  BookmarkListParams,
  BookmarkLookupItem,
  SearchResult,
} from '../types'
import { computeDedupKey } from '../utils'

export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  list: (params: BookmarkListParams) => [...bookmarkKeys.all, 'list', params] as const,
  lookup: (fingerprint: string) => [...bookmarkKeys.all, 'lookup', fingerprint] as const,
}

export function useBookmarks(params: BookmarkListParams = {}) {
  return useQuery({
    queryKey: bookmarkKeys.list(params),
    queryFn: () => bookmarksApi.list(params),
    placeholderData: (previous) => previous,
  })
}

export function useCreateBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: BookmarkCreate) => bookmarksApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
      toast.success('Bookmarked')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save bookmark')
    },
  })
}

export function useDeleteBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bookmarksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
      toast.success('Bookmark removed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove bookmark')
    },
  })
}

export function useDeleteBookmarkByKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (dedupKey: string) => bookmarksApi.deleteByKey(dedupKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove bookmark')
    },
  })
}

/**
 * For each result in the current search, return the matching bookmark id
 * (if any). Keyed by result.id for O(1) lookup at render time.
 */
export function useBookmarkLookup(results: SearchResult[]) {
  const items = useMemo<BookmarkLookupItem[]>(
    () =>
      results.map((r) => ({
        magnet_link: r.magnet_link,
        torrent_url: r.torrent_url,
        info_url: r.info_url,
        source_instance_name: r.source,
        indexer: r.indexer,
        title: r.title,
        size_bytes: r.size,
      })),
    [results],
  )

  const fingerprint = useMemo(
    () =>
      items
        .map(
          (i) =>
            `${i.magnet_link ?? ''}|${i.torrent_url ?? ''}|${i.info_url ?? ''}` +
            `|${i.source_instance_name ?? ''}|${i.indexer ?? ''}|${i.title ?? ''}|${i.size_bytes ?? ''}`,
        )
        .join('\n'),
    [items],
  )

  const query = useQuery({
    queryKey: bookmarkKeys.lookup(fingerprint),
    queryFn: () => bookmarksApi.lookup(items),
    enabled: items.length > 0,
    staleTime: 30_000,
  })

  const data = query.data
  const bookmarkIdByResultId = useMemo(() => {
    const map: Record<string, number> = {}
    if (!data) return map
    for (const result of results) {
      const key = computeDedupKey({
        magnet_link: result.magnet_link,
        torrent_url: result.torrent_url,
        info_url: result.info_url,
        source: result.source,
        indexer: result.indexer,
        title: result.title,
        size: result.size,
      })
      if (key && data.matches[key] !== undefined) {
        map[result.id] = data.matches[key]
      }
    }
    return map
  }, [data, results])

  return { ...query, bookmarkIdByResultId }
}

/**
 * One-shot helper for the search page bookmark icon — returns a callback
 * that toggles the bookmark for the given search result.
 */
export interface ToggleBookmarkArgs {
  result: SearchResult
  isCurrentlyBookmarked: boolean
  bookmarkId: number | undefined
}

export function useToggleResultBookmark() {
  const create = useCreateBookmark()
  const removeByKey = useDeleteBookmarkByKey()
  const removeById = useDeleteBookmark()

  return {
    isPending: create.isPending || removeByKey.isPending || removeById.isPending,
    toggle: ({ result, isCurrentlyBookmarked, bookmarkId }: ToggleBookmarkArgs) => {
      if (isCurrentlyBookmarked) {
        if (bookmarkId !== undefined) {
          removeById.mutate(bookmarkId)
        } else {
          const key = computeDedupKey({
            magnet_link: result.magnet_link,
            torrent_url: result.torrent_url,
            info_url: result.info_url,
            source: result.source,
            indexer: result.indexer,
            title: result.title,
            size: result.size,
          })
          if (key) removeByKey.mutate(key)
        }
        return
      }
      create.mutate({
        title: result.title,
        size_bytes: result.size,
        info_url: result.info_url,
        torrent_url: result.torrent_url,
        magnet_link: result.magnet_link,
        source_type: result.source_type,
        source_instance_name: result.source,
        indexer: result.indexer,
        category: result.category,
      })
    },
  }
}

/**
 * Convenience type for components that just want a Bookmark.
 */
export type { Bookmark }
