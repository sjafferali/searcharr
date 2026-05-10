import { useState, useCallback, useMemo, type ReactNode } from 'react'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Zap,
  Database,
  Check,
  Clock,
  Users,
  Magnet,
  FileDown,
  Download,
  Bookmark,
  ExternalLink,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  X,
} from 'lucide-react'
import {
  ColumnFilter,
  DownloadedBadge,
  IndexerPicker,
  LoadingSpinner,
  SendToClientModal,
} from '../components'
import { cn, formatAge, parseSize } from '../utils'
import {
  useBookmarkLookup,
  useClientsStatus,
  useHistoryLookup,
  useInstancesStatus,
  useLogHistory,
  useSearch,
  useSendToClient,
  useToggleResultBookmark,
} from '../hooks'
import { useSearchStore } from '../stores'
import { SearchResult, SearchCategory, SortBy, SortOrder } from '../types'
import toast from 'react-hot-toast'

const categories: SearchCategory[] = [
  'All',
  'Movies',
  'TV',
  'Music',
  'Software',
  'Games',
  'Books',
  'Anime',
  'Other',
]

type SortableColumn = {
  key: SortBy
  label: string
  align?: 'left' | 'center' | 'right'
  defaultOrder?: SortOrder
}

const titleColumn: SortableColumn = {
  key: 'name',
  label: 'Title',
  align: 'left',
  defaultOrder: 'asc',
}
const sizeColumn: SortableColumn = {
  key: 'size',
  label: 'Size',
  align: 'left',
  defaultOrder: 'desc',
}
const seedersColumn: SortableColumn = {
  key: 'seeders',
  label: 'S/L',
  align: 'center',
  defaultOrder: 'desc',
}
const dateColumn: SortableColumn = {
  key: 'date',
  label: 'Age',
  align: 'left',
  defaultOrder: 'desc',
}

export function SearchPage() {
  const { data: instancesStatus } = useInstancesStatus()
  const { data: clientsStatus } = useClientsStatus()
  const searchMutation = useSearch()
  const logHistory = useLogHistory()
  const sendToClient = useSendToClient()
  // results comes from the store; the hook reads it below.

  const {
    query,
    setQuery,
    filters,
    setCategory,
    setMinSeeders,
    setMaxSize,
    setSortBy,
    setSortOrder,
    toggleJackettId,
    toggleProwlarrId,
    toggleJackettIndexer,
    toggleProwlarrIndexer,
    setJackettIndexerSelection,
    setProwlarrIndexerSelection,
    clearJackettIndexerSelection,
    clearProwlarrIndexerSelection,
    results,
    setResults,
    totalResults,
    setTotalResults,
    isFiltersExpanded,
    toggleFilters,
  } = useSearchStore()

  const [sendResult, setSendResult] = useState<SearchResult | null>(null)

  const defaultClient = clientsStatus?.find((c) => c.is_default && c.status === 'online') ?? null

  const handleSendClick = useCallback(
    (result: SearchResult, event: React.MouseEvent) => {
      // Holding Shift forces the picker, even if a default exists.
      if (defaultClient && !event.shiftKey) {
        const instances =
          result.source_type === 'jackett'
            ? (instancesStatus?.jackett ?? [])
            : (instancesStatus?.prowlarr ?? [])
        const sourceInstance = instances.find((i) => i.name === result.source)

        sendToClient.mutate({
          client_id: defaultClient.id,
          magnet_link: result.magnet_link ?? undefined,
          torrent_url: result.torrent_url ?? undefined,
          title: result.title,
          size_bytes: result.size,
          info_url: result.info_url,
          source_type: result.source_type,
          source_instance_id: sourceInstance?.id ?? null,
          source_instance_name: result.source,
          indexer: result.indexer,
          search_query: query?.trim() || null,
        })
        return
      }
      setSendResult(result)
    },
    [defaultClient, instancesStatus, sendToClient, query],
  )

  const handleSortClick = useCallback(
    (column: SortableColumn) => {
      if (filters.sortBy === column.key) {
        setSortOrder(filters.sortOrder === 'asc' ? 'desc' : 'asc')
      } else {
        setSortBy(column.key)
        setSortOrder(column.defaultOrder ?? 'desc')
      }
    },
    [filters.sortBy, filters.sortOrder, setSortBy, setSortOrder],
  )

  const maxSizeBytes = useMemo(
    () => (filters.maxSize ? parseSize(filters.maxSize) : null),
    [filters.maxSize],
  )
  const maxSizeInvalid = !!filters.maxSize && maxSizeBytes === null

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filters.minSeeders > 0 && r.seeders < filters.minSeeders) return false
      if (maxSizeBytes !== null && r.size > maxSizeBytes) return false
      return true
    })
  }, [results, filters.minSeeders, maxSizeBytes])

  const sortedResults = useMemo(() => {
    const copy = [...filteredResults]
    const reverse = filters.sortOrder === 'desc'
    const dir = reverse ? -1 : 1
    copy.sort((a, b) => {
      switch (filters.sortBy) {
        case 'seeders':
          return (a.seeders - b.seeders) * dir
        case 'size':
          return (a.size - b.size) * dir
        case 'name':
          return a.title.localeCompare(b.title) * dir
        case 'date': {
          const aTime = a.date ? new Date(a.date).getTime() : -Infinity
          const bTime = b.date ? new Date(b.date).getTime() : -Infinity
          return (aTime - bTime) * dir
        }
        default:
          return 0
      }
    })
    return copy
  }, [filteredResults, filters.sortBy, filters.sortOrder])

  const { matchesByResultId } = useHistoryLookup(sortedResults)
  const { bookmarkIdByResultId } = useBookmarkLookup(sortedResults)
  const bookmarkToggle = useToggleResultBookmark()

  const jackettInstances = instancesStatus?.jackett ?? []
  const prowlarrInstances = instancesStatus?.prowlarr ?? []
  const allInstances = [
    ...jackettInstances.map((i) => ({ ...i, type: 'jackett' as const })),
    ...prowlarrInstances.map((i) => ({ ...i, type: 'prowlarr' as const })),
  ]

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      toast.error('Please enter a search query')
      return
    }

    try {
      // When any instance is explicitly selected, use exclusive mode
      // This ensures we only search the selected instances, not all of the unselected type
      const hasAnySelection =
        filters.selectedJackettIds.length > 0 || filters.selectedProwlarrIds.length > 0

      // Build per-instance indexer filter params: "<instance_id>:<indexer_id>"
      const jackettIndexerParams: string[] = []
      for (const instanceId of filters.selectedJackettIds) {
        const subset = filters.jackettIndexerSelections[instanceId]
        if (subset && subset.length > 0) {
          for (const indexerId of subset) {
            jackettIndexerParams.push(`${instanceId}:${indexerId}`)
          }
        }
      }
      const prowlarrIndexerParams: string[] = []
      for (const instanceId of filters.selectedProwlarrIds) {
        const subset = filters.prowlarrIndexerSelections[instanceId]
        if (subset && subset.length > 0) {
          for (const indexerId of subset) {
            prowlarrIndexerParams.push(`${instanceId}:${indexerId}`)
          }
        }
      }

      const response = await searchMutation.mutateAsync({
        q: query,
        category: filters.category !== 'All' ? filters.category : undefined,
        jackett_ids: filters.selectedJackettIds.length > 0 ? filters.selectedJackettIds : undefined,
        prowlarr_ids:
          filters.selectedProwlarrIds.length > 0 ? filters.selectedProwlarrIds : undefined,
        jackett_indexers: jackettIndexerParams.length > 0 ? jackettIndexerParams : undefined,
        prowlarr_indexers: prowlarrIndexerParams.length > 0 ? prowlarrIndexerParams : undefined,
        exclusive_filter: hasAnySelection,
        sort_by: filters.sortBy,
        sort_order: filters.sortOrder,
      })

      setResults(response.results)
      setTotalResults(response.total_results)

      if (response.errors.length > 0) {
        toast.error(`Some sources had errors: ${response.errors.join(', ')}`)
      }
    } catch {
      // Error handled by mutation
    }
  }, [query, filters, searchMutation, setResults, setTotalResults])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const copyMagnet = async (result: SearchResult) => {
    if (!result.magnet_link) {
      toast.error('No magnet link available')
      return
    }

    try {
      await navigator.clipboard.writeText(result.magnet_link)
      toast.success('Magnet link copied to clipboard')
    } catch {
      toast.error('Failed to copy magnet link')
    }
  }

  const downloadTorrent = (result: SearchResult) => {
    if (!result.torrent_url) {
      toast.error('No torrent file available')
      return
    }

    const sourceInstance =
      result.source_type === 'jackett'
        ? jackettInstances.find((i) => i.name === result.source)
        : prowlarrInstances.find((i) => i.name === result.source)

    logHistory.mutate({
      title: result.title,
      size_bytes: result.size,
      info_url: result.info_url,
      torrent_url: result.torrent_url,
      magnet_link: result.magnet_link,
      source_type: result.source_type,
      source_instance_id: sourceInstance?.id ?? null,
      source_instance_name: result.source,
      indexer: result.indexer,
      search_query: query.trim() || null,
    })

    window.open(result.torrent_url, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <div className="flex gap-3">
          <div className="group relative flex-1">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 opacity-0 blur-xl transition-opacity group-focus-within:opacity-100" />
            <div className="relative flex items-center overflow-hidden rounded-xl border border-slate-700/50 bg-slate-800/50 transition-all focus-within:border-cyan-500/50">
              <Search className="ml-4 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search across all indexers..."
                className="flex-1 bg-transparent px-4 py-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
              />
              <select
                value={filters.category}
                onChange={(e) => setCategory(e.target.value as SearchCategory)}
                className="h-full cursor-pointer border-l border-slate-600/50 bg-slate-700/50 px-4 py-4 text-sm text-slate-200 focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleSearch}
            disabled={searchMutation.isPending}
            className="btn-primary flex items-center gap-2 rounded-xl px-8"
          >
            {searchMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-5 w-5" />
                Search
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
        <button
          onClick={toggleFilters}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/30"
        >
          <span className="flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400" />
            Sources
          </span>
          {isFiltersExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {isFiltersExpanded && (
          <div className="space-y-4 border-t border-slate-800/50 px-4 pb-4">
            <div className="pt-4">
              <p className="mb-3 text-[11px] text-slate-500">
                {filters.selectedJackettIds.length === 0 && filters.selectedProwlarrIds.length === 0
                  ? 'Searching every configured instance.'
                  : 'Searching only the selected instances.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {allInstances.map((instance) => {
                  const isSelected =
                    instance.type === 'jackett'
                      ? filters.selectedJackettIds.includes(instance.id)
                      : filters.selectedProwlarrIds.includes(instance.id)

                  return (
                    <button
                      key={`${instance.type}-${instance.id}`}
                      onClick={() =>
                        instance.type === 'jackett'
                          ? toggleJackettId(instance.id)
                          : toggleProwlarrId(instance.id)
                      }
                      disabled={instance.status === 'offline'}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                        isSelected
                          ? instance.type === 'jackett'
                            ? 'border border-amber-500/30 bg-amber-500/20 text-amber-300'
                            : 'border border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
                          : 'border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600',
                        instance.status === 'offline' && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {instance.type === 'jackett' ? (
                        <Zap className="h-3 w-3" />
                      ) : (
                        <Database className="h-3 w-3" />
                      )}
                      {instance.name}
                      {isSelected && <Check className="h-3 w-3" />}
                    </button>
                  )
                })}
                {allInstances.length === 0 && (
                  <p className="text-sm text-slate-500">No instances configured</p>
                )}
              </div>

              {/* Per-instance indexer pickers, shown only for selected instances */}
              {(filters.selectedJackettIds.length > 0 ||
                filters.selectedProwlarrIds.length > 0) && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    Refine indexers (optional)
                  </p>
                  {filters.selectedJackettIds.map((id) => {
                    const inst = jackettInstances.find((i) => i.id === id)
                    if (!inst) return null
                    return (
                      <IndexerPicker
                        key={`jackett-${id}`}
                        instanceId={id}
                        instanceName={inst.name}
                        type="jackett"
                        selectedIds={filters.jackettIndexerSelections[id] ?? []}
                        onToggle={(indexerId) => toggleJackettIndexer(id, indexerId)}
                        onSetSelection={(ids) => setJackettIndexerSelection(id, ids)}
                        onClearSelection={() => clearJackettIndexerSelection(id)}
                      />
                    )
                  })}
                  {filters.selectedProwlarrIds.map((id) => {
                    const inst = prowlarrInstances.find((i) => i.id === id)
                    if (!inst) return null
                    return (
                      <IndexerPicker
                        key={`prowlarr-${id}`}
                        instanceId={id}
                        instanceName={inst.name}
                        type="prowlarr"
                        selectedIds={filters.prowlarrIndexerSelections[id] ?? []}
                        onToggle={(indexerId) => toggleProwlarrIndexer(id, indexerId)}
                        onSetSelection={(ids) => setProwlarrIndexerSelection(id, ids)}
                        onClearSelection={() => clearProwlarrIndexerSelection(id)}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-400">
            {results.length === 0 ? (
              <>{totalResults} results found</>
            ) : sortedResults.length === results.length ? (
              <>
                <span className="font-medium text-slate-200">{results.length}</span>{' '}
                {results.length === 1 ? 'result' : 'results'}
              </>
            ) : (
              <>
                <span className="font-medium text-slate-200">{sortedResults.length}</span> of{' '}
                <span className="font-medium text-slate-200">{results.length}</span> shown
                <span className="ml-1 text-slate-500">
                  ({results.length - sortedResults.length} hidden by filters)
                </span>
              </>
            )}
          </p>
          {(filters.minSeeders > 0 || filters.maxSize) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.minSeeders > 0 && (
                <button
                  type="button"
                  onClick={() => setMinSeeders(0)}
                  className="group/pill inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                  title="Clear filter"
                >
                  ≥ {filters.minSeeders} seeders
                  <X className="h-3 w-3 opacity-60 transition-opacity group-hover/pill:opacity-100" />
                </button>
              )}
              {filters.maxSize && (
                <button
                  type="button"
                  onClick={() => setMaxSize('')}
                  className={cn(
                    'group/pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                    maxSizeInvalid
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                      : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
                  )}
                  title="Clear filter"
                >
                  ≤ {filters.maxSize}
                  <X className="h-3 w-3 opacity-60 transition-opacity group-hover/pill:opacity-100" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results Table */}
        {sortedResults.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/50">
                    <SortableTh
                      column={titleColumn}
                      activeSortBy={filters.sortBy}
                      activeSortOrder={filters.sortOrder}
                      onClick={handleSortClick}
                    />
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Source
                    </th>
                    <SortableTh
                      column={sizeColumn}
                      activeSortBy={filters.sortBy}
                      activeSortOrder={filters.sortOrder}
                      onClick={handleSortClick}
                      filter={{
                        label: 'Filter by max size',
                        isActive: !!filters.maxSize,
                        onClear: () => setMaxSize(''),
                        panel: (close) => (
                          <div>
                            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                              Max size
                            </label>
                            <input
                              type="text"
                              value={filters.maxSize}
                              onChange={(e) => setMaxSize(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="e.g. 10GB"
                              className={cn(
                                'w-full rounded-md border bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none',
                                maxSizeInvalid
                                  ? 'border-rose-500/60 focus:border-rose-400'
                                  : 'border-slate-700 focus:border-cyan-500/50',
                              )}
                              autoFocus
                            />
                            <p
                              className={cn(
                                'mt-1.5 text-[10px]',
                                maxSizeInvalid ? 'text-rose-300' : 'text-slate-500',
                              )}
                            >
                              {maxSizeInvalid
                                ? 'Use a unit like KB, MB, GB, TB.'
                                : 'Hides results larger than this.'}
                            </p>
                          </div>
                        ),
                      }}
                    />
                    <SortableTh
                      column={seedersColumn}
                      activeSortBy={filters.sortBy}
                      activeSortOrder={filters.sortOrder}
                      onClick={handleSortClick}
                      filter={{
                        label: 'Filter by minimum seeders',
                        isActive: filters.minSeeders > 0,
                        onClear: () => setMinSeeders(0),
                        panel: (close) => (
                          <div>
                            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                              Min seeders
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={filters.minSeeders || ''}
                              onChange={(e) => setMinSeeders(Number(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="0"
                              className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                              autoFocus
                            />
                            <p className="mt-1.5 text-[10px] text-slate-500">
                              Hides results with fewer seeders.
                            </p>
                          </div>
                        ),
                      }}
                    />
                    <SortableTh
                      column={dateColumn}
                      activeSortBy={filters.sortBy}
                      activeSortOrder={filters.sortOrder}
                      onClick={handleSortClick}
                    />
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {sortedResults.map((result, idx) => {
                    const isDead = result.seeders === 0
                    return (
                      <tr
                        key={result.id}
                        className={cn(
                          'group animate-fade-in transition-all hover:bg-slate-800/30',
                          isDead && 'opacity-60 hover:opacity-100',
                        )}
                        style={{ animationDelay: `${idx * 50}ms` }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() =>
                                bookmarkToggle.toggle({
                                  result,
                                  isCurrentlyBookmarked:
                                    bookmarkIdByResultId[result.id] !== undefined,
                                  bookmarkId: bookmarkIdByResultId[result.id],
                                })
                              }
                              disabled={bookmarkToggle.isPending}
                              title={
                                bookmarkIdByResultId[result.id] !== undefined
                                  ? 'Remove bookmark'
                                  : 'Bookmark this result'
                              }
                              className={cn(
                                'mt-0.5 rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                bookmarkIdByResultId[result.id] !== undefined
                                  ? 'text-amber-400 hover:text-amber-300'
                                  : 'text-slate-600 hover:text-slate-400',
                              )}
                            >
                              <Bookmark
                                className={cn(
                                  'h-4 w-4',
                                  bookmarkIdByResultId[result.id] !== undefined && 'fill-current',
                                )}
                              />
                            </button>
                            <div className="min-w-0 flex-1">
                              {result.info_url ? (
                                <a
                                  href={result.info_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group/link block text-sm font-medium leading-snug text-slate-200 transition-colors [overflow-wrap:anywhere] hover:text-cyan-300"
                                  title={result.title}
                                >
                                  {result.title}
                                  <ExternalLink className="ml-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle opacity-0 transition-opacity group-hover/link:opacity-100" />
                                </a>
                              ) : (
                                <p
                                  className="block text-sm font-medium leading-snug text-slate-200 [overflow-wrap:anywhere]"
                                  title={result.title}
                                >
                                  {result.title}
                                </p>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {matchesByResultId[result.id] && (
                                  <DownloadedBadge match={matchesByResultId[result.id]} />
                                )}
                                {isDead && (
                                  <span
                                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300"
                                    title="No seeders — this torrent is unlikely to download"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    Dead
                                  </span>
                                )}
                                {result.freeleech && (
                                  <span
                                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-emerald-400/40 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                                    title="Freeleech — download does not count against ratio"
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    Freeleech
                                  </span>
                                )}
                                {!result.freeleech &&
                                  result.download_volume_factor !== null &&
                                  result.download_volume_factor !== undefined &&
                                  result.download_volume_factor > 0 &&
                                  result.download_volume_factor < 1 && (
                                    <span
                                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-teal-400/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300"
                                      title={`Download counts at ${Math.round(
                                        result.download_volume_factor * 100,
                                      )}% of size`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      {Math.round(result.download_volume_factor * 100)}% leech
                                    </span>
                                  )}
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <span className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                                  {result.category}
                                </span>
                                <span className="text-[10px] text-slate-500">{result.indexer}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium',
                              result.source_type === 'jackett'
                                ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                                : 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
                            )}
                          >
                            {result.source_type === 'jackett' ? (
                              <Zap className="h-3 w-3" />
                            ) : (
                              <Database className="h-3 w-3" />
                            )}
                            {result.source}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-300">
                          {result.size_formatted}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2 text-xs">
                            <span
                              className={cn(
                                'flex items-center gap-1 font-medium',
                                isDead ? 'text-rose-400' : 'text-emerald-400',
                              )}
                            >
                              <Users className="h-3 w-3" />
                              {result.seeders.toLocaleString()}
                            </span>
                            <span className="text-slate-600">/</span>
                            <span className="text-red-400">{result.leechers}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {formatAge(result.date)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => copyMagnet(result)}
                              disabled={!result.magnet_link}
                              className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Copy Magnet"
                            >
                              <Magnet className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => downloadTorrent(result)}
                              disabled={!result.torrent_url}
                              className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Download .torrent"
                            >
                              <FileDown className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => handleSendClick(result, e)}
                              disabled={
                                (!result.magnet_link && !result.torrent_url) ||
                                sendToClient.isPending
                              }
                              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:from-emerald-500/30 hover:to-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                              title={
                                !result.magnet_link && !result.torrent_url
                                  ? 'No magnet link or torrent file available'
                                  : defaultClient
                                    ? `Send to ${defaultClient.name} (Shift+click to choose a different client)`
                                    : 'Send to download client'
                              }
                            >
                              <Download className="h-4 w-4" />
                              Send
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : results.length > 0 ? (
          <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
            <Filter className="mx-auto mb-4 h-12 w-12 text-slate-600" />
            <p className="text-slate-400">No results match the active filters</p>
            <p className="mt-1 text-sm text-slate-500">
              Loosen the column filters above to see more.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
            <Search className="mx-auto mb-4 h-12 w-12 text-slate-600" />
            <p className="text-slate-400">Enter a search query to find torrents</p>
            <p className="mt-1 text-sm text-slate-500">
              Results will be aggregated from all configured sources
            </p>
          </div>
        )}
      </div>

      {/* Send to Client Modal */}
      <SendToClientModal
        isOpen={!!sendResult}
        onClose={() => setSendResult(null)}
        result={sendResult}
        searchQuery={query}
      />
    </div>
  )
}

interface SortableThProps {
  column: SortableColumn
  activeSortBy: SortBy
  activeSortOrder: SortOrder
  onClick: (column: SortableColumn) => void
  filter?: {
    isActive: boolean
    label: string
    panel: (close: () => void) => ReactNode
    onClear: () => void
  }
}

function SortableTh({ column, activeSortBy, activeSortOrder, onClick, filter }: SortableThProps) {
  const isActive = activeSortBy === column.key
  const align = column.align ?? 'left'
  const justify =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
  const textAlign =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

  return (
    <th
      scope="col"
      aria-sort={isActive ? (activeSortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-3 text-xs font-medium uppercase tracking-wider', textAlign)}
    >
      <div className={cn('group/cell flex items-center gap-1', justify)}>
        <button
          type="button"
          onClick={() => onClick(column)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded transition-colors',
            isActive ? 'text-cyan-300' : 'text-slate-400 hover:text-slate-200',
          )}
          title={`Sort by ${column.label.toLowerCase()}`}
        >
          <span>{column.label}</span>
          {isActive ? (
            activeSortOrder === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/cell:opacity-60" />
          )}
        </button>
        {filter && (
          <ColumnFilter
            label={filter.label}
            isActive={filter.isActive}
            panel={filter.panel}
            onClear={filter.onClear}
          />
        )}
      </div>
    </th>
  )
}
