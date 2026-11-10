import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Check,
  Magnet,
  FileDown,
  Download,
  Bookmark,
  ExternalLink,
  Star,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  X,
} from 'lucide-react'
import {
  ColumnFilter,
  DownloadedBadge,
  IndexerErrorBanner,
  IndexerPicker,
  LoadingSpinner,
  SendToClientModal,
} from '../components'
import { cn, formatAge, formatDateTime, parseSize } from '../utils'
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
import { useSearchStore, type DefaultSourcesPayload } from '../stores'
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
  align: 'right',
  defaultOrder: 'desc',
}
const seedersColumn: SortableColumn = {
  key: 'seeders',
  label: 'S/L',
  align: 'right',
  defaultOrder: 'desc',
}
const dateColumn: SortableColumn = {
  key: 'date',
  label: 'Age',
  align: 'right',
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
    setHideDead,
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
    applyDefaultSources,
    clearSourceSelections,
    results,
    setResults,
    totalResults,
    setTotalResults,
    searchErrors,
    setSearchErrors,
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

  // "Hide dead" composes with the min-seeders column filter: whichever floor
  // is higher wins, so a user-set minimum is never lowered.
  const effectiveMinSeeders = filters.hideDead
    ? Math.max(1, filters.minSeeders)
    : filters.minSeeders

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (effectiveMinSeeders > 0 && r.seeders < effectiveMinSeeders) return false
      if (maxSizeBytes !== null && r.size > maxSizeBytes) return false
      return true
    })
  }, [results, effectiveMinSeeders, maxSizeBytes])

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

  const jackettInstances = useMemo(() => instancesStatus?.jackett ?? [], [instancesStatus])
  const prowlarrInstances = useMemo(() => instancesStatus?.prowlarr ?? [], [instancesStatus])
  const allInstances = [
    ...jackettInstances.map((i) => ({ ...i, type: 'jackett' as const })),
    ...prowlarrInstances.map((i) => ({ ...i, type: 'prowlarr' as const })),
  ]

  const defaultSourcesPayload = useMemo<DefaultSourcesPayload>(
    () => ({
      jackett: jackettInstances.map((i) => ({
        id: i.id,
        defaultIndexers: i.default_indexers ?? [],
      })),
      prowlarr: prowlarrInstances.map((i) => ({
        id: i.id,
        defaultIndexers: i.default_indexers ?? [],
      })),
    }),
    [jackettInstances, prowlarrInstances],
  )

  const hasConfiguredDefaults =
    defaultSourcesPayload.jackett.some((i) => i.defaultIndexers.length > 0) ||
    defaultSourcesPayload.prowlarr.some((i) => i.defaultIndexers.length > 0)

  // Pre-select the configured default sources the first time instance data
  // arrives; the store skips this when the user already picked sources.
  useEffect(() => {
    if (!instancesStatus) return
    applyDefaultSources(defaultSourcesPayload)
  }, [instancesStatus, defaultSourcesPayload, applyDefaultSources])

  const hasSourceSelection =
    filters.selectedJackettIds.length > 0 || filters.selectedProwlarrIds.length > 0

  const selectionMatchesDefaults = useMemo(() => {
    if (!hasConfiguredDefaults) return false
    const jackettDefaults = defaultSourcesPayload.jackett.filter(
      (i) => i.defaultIndexers.length > 0,
    )
    const prowlarrDefaults = defaultSourcesPayload.prowlarr.filter(
      (i) => i.defaultIndexers.length > 0,
    )
    return (
      sameSet(
        filters.selectedJackettIds,
        jackettDefaults.map((i) => i.id),
      ) &&
      sameSet(
        filters.selectedProwlarrIds,
        prowlarrDefaults.map((i) => i.id),
      ) &&
      jackettDefaults.every((i) =>
        sameSet(filters.jackettIndexerSelections[i.id] ?? [], i.defaultIndexers),
      ) &&
      prowlarrDefaults.every((i) =>
        sameSet(filters.prowlarrIndexerSelections[i.id] ?? [], i.defaultIndexers),
      )
    )
  }, [hasConfiguredDefaults, defaultSourcesPayload, filters])

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
      setSearchErrors(response.errors)

      if (response.errors.length > 0) {
        const n = response.errors.length
        toast.error(`${n} indexer${n === 1 ? '' : 's'} returned an error — see details below`)
      }
    } catch {
      // Error handled by mutation
    }
  }, [query, filters, searchMutation, setResults, setTotalResults, setSearchErrors])

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
      <div>
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex h-11 items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800 transition-colors focus-within:border-cyan-500">
              <Search className="ml-4 h-4 w-4 flex-shrink-0 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search releases"
                className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <select
                value={filters.category}
                onChange={(e) => setCategory(e.target.value as SearchCategory)}
                className="h-full cursor-pointer border-l border-slate-700 bg-slate-800 px-4 text-sm text-slate-200 focus:outline-none"
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
            aria-label="Search"
            className="btn-primary flex h-11 flex-shrink-0 items-center gap-2 px-4 sm:px-5"
          >
            {searchMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                Searching…
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <button
          onClick={toggleFilters}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/50"
        >
          <span className="flex items-center gap-2">
            Sources
            {selectionMatchesDefaults ? (
              <span className="tag">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                Defaults
              </span>
            ) : hasSourceSelection ? (
              <span className="tag tag-accent">
                <Filter className="h-3 w-3" />
                Custom
              </span>
            ) : (
              <span className="tag">All instances</span>
            )}
          </span>
          {isFiltersExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {isFiltersExpanded && (
          <div className="space-y-4 border-t border-slate-800 px-4 pb-4">
            <div className="pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {!hasSourceSelection
                    ? 'Searching every configured instance'
                    : selectionMatchesDefaults
                      ? 'Searching your default sources'
                      : 'Searching only the selected instances'}
                </p>
                <div className="flex items-center gap-2">
                  {hasConfiguredDefaults && !selectionMatchesDefaults && (
                    <button
                      type="button"
                      onClick={() => applyDefaultSources(defaultSourcesPayload, { force: true })}
                      className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                      title="Select the default sources configured on the Instances page"
                    >
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      Use defaults
                    </button>
                  )}
                  {hasSourceSelection && (
                    <button
                      type="button"
                      onClick={clearSourceSelections}
                      className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                      title="Clear the selection and search every configured instance"
                    >
                      <X className="h-3 w-3" />
                      Clear selection
                    </button>
                  )}
                </div>
              </div>
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
                        'flex h-8 items-center gap-2 rounded-lg border px-3 text-xs transition-colors',
                        isSelected
                          ? 'border-cyan-500/50 bg-slate-800 font-medium text-slate-100'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200',
                        instance.status === 'offline' && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          instance.status === 'online'
                            ? 'bg-emerald-400'
                            : instance.status === 'offline'
                              ? 'bg-red-400'
                              : 'bg-slate-600',
                        )}
                      />
                      {instance.name}
                      {isSelected && <Check className="h-3 w-3 text-cyan-400" />}
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
                  <p className="text-xs text-slate-500">Refine indexers (optional)</p>
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

      {/* Indexer errors */}
      <IndexerErrorBanner errors={searchErrors} />

      {/* Results */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-400">
            {results.length === 0 ? (
              searchMutation.isSuccess ? (
                <>
                  <span className="font-mono text-slate-200">{totalResults}</span> results
                </>
              ) : null
            ) : sortedResults.length === results.length ? (
              <>
                <span className="font-mono text-slate-200">{results.length}</span>{' '}
                {results.length === 1 ? 'result' : 'results'}
              </>
            ) : (
              <>
                <span className="font-mono text-slate-200">{sortedResults.length}</span> of{' '}
                <span className="font-mono text-slate-200">{results.length}</span> shown
                <span className="ml-1 text-slate-500">
                  ({results.length - sortedResults.length} hidden by filters)
                </span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={filters.hideDead}
                onChange={(e) => setHideDead(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-cyan-500"
              />
              <span>Hide dead items</span>
            </label>
            {(filters.minSeeders > 0 || filters.maxSize) && (
              <div className="flex flex-wrap items-center gap-1">
                {filters.minSeeders > 0 && (
                  <button
                    type="button"
                    onClick={() => setMinSeeders(0)}
                    className="tag tag-accent group/pill transition-colors hover:bg-slate-800"
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
                      'tag group/pill transition-colors hover:bg-slate-800',
                      maxSizeInvalid ? 'tag-bad' : 'tag-accent',
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
        </div>

        {/* Results Table */}
        {sortedResults.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px]">
                <thead>
                  <tr className="border-b border-slate-800">
                    <SortableTh
                      column={titleColumn}
                      activeSortBy={filters.sortBy}
                      activeSortOrder={filters.sortOrder}
                      onClick={handleSortClick}
                    />
                    <th className="px-4 py-2 text-left text-xs font-normal text-slate-500">
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
                            <label className="mb-2 block text-xs text-slate-400">Max size</label>
                            <input
                              type="text"
                              value={filters.maxSize}
                              onChange={(e) => setMaxSize(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="e.g. 10GB"
                              className={cn(
                                'h-8 w-full rounded-lg border bg-slate-800 px-3 font-mono text-sm text-slate-200 placeholder-slate-500 focus:outline-none',
                                maxSizeInvalid
                                  ? 'border-red-500 focus:border-red-400'
                                  : 'border-slate-700 focus:border-cyan-500',
                              )}
                              autoFocus
                            />
                            <p
                              className={cn(
                                'mt-2 text-2xs',
                                maxSizeInvalid ? 'text-red-300' : 'text-slate-500',
                              )}
                            >
                              {maxSizeInvalid
                                ? 'Use a unit like KB, MB, GB, TB'
                                : 'Hides results larger than this'}
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
                            <label className="mb-2 block text-xs text-slate-400">Min seeders</label>
                            <input
                              type="number"
                              min={0}
                              value={filters.minSeeders || ''}
                              onChange={(e) => setMinSeeders(Number(e.target.value) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="0"
                              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 font-mono text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                              autoFocus
                            />
                            <p className="mt-2 text-2xs text-slate-500">
                              Hides results with fewer seeders
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
                    <th className="px-4 py-2 text-right text-xs font-normal text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => {
                    const isDead = result.seeders === 0
                    return (
                      <tr
                        key={result.id}
                        className={cn(
                          'group border-t border-slate-800 transition-colors first:border-t-0 hover:bg-slate-800/50',
                          isDead && 'opacity-60 hover:opacity-100',
                        )}
                      >
                        <td className="w-full max-w-0 px-4 py-3">
                          <div className="flex items-start gap-2">
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
                                '-ml-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                bookmarkIdByResultId[result.id] !== undefined
                                  ? 'text-cyan-400 hover:text-cyan-300'
                                  : 'text-slate-600 hover:text-slate-300',
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
                                  className="group/link flex items-center gap-1 text-sm text-slate-100 transition-colors hover:text-cyan-300"
                                  title={result.title}
                                >
                                  <span className="truncate">{result.title}</span>
                                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
                                </a>
                              ) : (
                                <p className="truncate text-sm text-slate-100" title={result.title}>
                                  {result.title}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {matchesByResultId[result.id] && (
                                  <DownloadedBadge match={matchesByResultId[result.id]} />
                                )}
                                {isDead && (
                                  <span
                                    className="tag tag-bad"
                                    title="No seeders — this torrent is unlikely to download"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    Dead
                                  </span>
                                )}
                                {result.freeleech && (
                                  <span
                                    className="tag tag-good"
                                    title="Freeleech — download does not count against ratio"
                                  >
                                    Freeleech
                                  </span>
                                )}
                                {!result.freeleech &&
                                  result.download_volume_factor !== null &&
                                  result.download_volume_factor !== undefined &&
                                  result.download_volume_factor > 0 &&
                                  result.download_volume_factor < 1 && (
                                    <span
                                      className="tag"
                                      title={`Download counts at ${Math.round(
                                        result.download_volume_factor * 100,
                                      )}% of size`}
                                    >
                                      {Math.round(result.download_volume_factor * 100)}% leech
                                    </span>
                                  )}
                                <span className="tag">{result.category}</span>
                                <span className="ml-1 text-2xs text-slate-500">
                                  {result.indexer}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="whitespace-nowrap text-xs text-slate-400"
                            title={result.source_type === 'jackett' ? 'Jackett' : 'Prowlarr'}
                          >
                            {result.source}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">
                          {result.size_formatted}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 text-sm">
                            <span className={cn(isDead ? 'text-slate-500' : 'text-emerald-400')}>
                              {result.seeders.toLocaleString()}
                            </span>
                            <span className="text-slate-600">/</span>
                            <span className="text-red-400">{result.leechers}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">
                          <div
                            title={
                              result.date
                                ? `Indexer reported: ${formatDateTime(result.date)}`
                                : 'No date reported'
                            }
                          >
                            {formatAge(result.date)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => copyMagnet(result)}
                              disabled={!result.magnet_link}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              title="Copy magnet link"
                            >
                              <Magnet className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => downloadTorrent(result)}
                              disabled={!result.torrent_url}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                              className="btn-secondary ml-1 flex h-8 items-center gap-2 px-3 text-xs"
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
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
            <p className="text-sm text-slate-200">No results match the active filters</p>
            <p className="mt-1 text-sm text-slate-500">
              Loosen the column filters above to see more
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
            <p className="text-sm text-slate-200">
              {searchMutation.isSuccess ? 'No releases found' : 'Search for a release by name'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {searchMutation.isSuccess
                ? 'Try a shorter query or more sources'
                : 'Results from every selected source land in one table'}
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

function sameSet<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((v) => set.has(v))
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
      className={cn('whitespace-nowrap px-4 py-2 text-xs font-normal', textAlign)}
    >
      <div className={cn('group/cell flex items-center gap-1', justify)}>
        <button
          type="button"
          onClick={() => onClick(column)}
          className={cn(
            'inline-flex items-center gap-1 rounded transition-colors',
            isActive ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-200',
          )}
          title={`Sort by ${column.label.toLowerCase()}`}
        >
          <span>{column.label}</span>
          {isActive ? (
            activeSortOrder === 'asc' ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover/cell:opacity-60" />
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
