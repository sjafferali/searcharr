import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import toast from 'react-hot-toast'
import { historyApi } from '../api'
import {
  HistoryEntryCreate,
  HistoryListParams,
  HistoryLookupItem,
  HistoryMatch,
  SearchResult,
} from '../types'

export const historyKeys = {
  all: ['history'] as const,
  list: (params: HistoryListParams) => [...historyKeys.all, 'list', params] as const,
  lookup: (fingerprint: string) => [...historyKeys.all, 'lookup', fingerprint] as const,
}

export function useHistory(params: HistoryListParams) {
  return useQuery({
    queryKey: historyKeys.list(params),
    queryFn: () => historyApi.list(params),
    placeholderData: (previous) => previous,
  })
}

export function useDeleteHistoryEntry() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => historyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: historyKeys.all })
      toast.success('History entry deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete history entry')
    },
  })
}

export function useLogHistory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: HistoryEntryCreate) => historyApi.create(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: historyKeys.all })
    },
    // Silent on error — best-effort logging shouldn't interrupt the user.
  })
}

/**
 * Look up prior download history for a list of search results.
 * Returns a map of result.id -> match (only includes results with matches).
 */
export function useHistoryLookup(results: SearchResult[]) {
  const items = useMemo<HistoryLookupItem[]>(
    () =>
      results.map((r) => ({
        title: r.title,
        size_bytes: r.size,
        info_url: r.info_url,
      })),
    [results],
  )

  // A stable cache key derived from the items themselves so refetching the
  // same results doesn't re-issue the request.
  const fingerprint = useMemo(
    () => items.map((i) => `${i.title}|${i.size_bytes ?? ''}|${i.info_url ?? ''}`).join('\n'),
    [items],
  )

  const query = useQuery({
    queryKey: historyKeys.lookup(fingerprint),
    queryFn: () => historyApi.lookup(items),
    enabled: items.length > 0,
    staleTime: 30_000,
  })

  // Build a map keyed by result.id for O(1) lookups in the renderer.
  const data = query.data
  const matchesByResultId = useMemo(() => {
    const map: Record<string, HistoryMatch> = {}
    if (!data) return map
    for (const match of data.matches) {
      const result = results[match.index]
      if (result) {
        map[result.id] = match
      }
    }
    return map
  }, [data, results])

  return { ...query, matchesByResultId }
}
