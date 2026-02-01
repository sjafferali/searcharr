import { useState, useCallback } from 'react'
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
} from 'lucide-react'
import { LoadingSpinner, SendToClientModal } from '../components'
import { cn, formatDate } from '../utils'
import { useInstancesStatus, useSearch } from '../hooks'
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

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'seeders', label: 'Seeders' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date' },
  { value: 'name', label: 'Name' },
]

const sortOrders: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
]

export function SearchPage() {
  const { data: instancesStatus } = useInstancesStatus()
  const searchMutation = useSearch()

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
    results,
    setResults,
    totalResults,
    setTotalResults,
    isFiltersExpanded,
    toggleFilters,
    bookmarkedIds,
    toggleBookmark,
  } = useSearchStore()

  const [sendResult, setSendResult] = useState<SearchResult | null>(null)

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
      const response = await searchMutation.mutateAsync({
        q: query,
        category: filters.category !== 'All' ? filters.category : undefined,
        jackett_ids: filters.selectedJackettIds.length > 0 ? filters.selectedJackettIds : undefined,
        prowlarr_ids:
          filters.selectedProwlarrIds.length > 0 ? filters.selectedProwlarrIds : undefined,
        min_seeders: filters.minSeeders > 0 ? filters.minSeeders : undefined,
        max_size: filters.maxSize || undefined,
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
            <Filter className="h-4 w-4 text-cyan-400" />
            Filters & Sources
          </span>
          {isFiltersExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {isFiltersExpanded && (
          <div className="space-y-4 border-t border-slate-800/50 px-4 pb-4">
            {/* Source Selection */}
            <div className="pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
                Search Sources
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
            </div>

            {/* Filter Options */}
            <div className="grid grid-cols-4 gap-4 border-t border-slate-800/50 pt-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Min Seeders</label>
                <input
                  type="number"
                  value={filters.minSeeders}
                  onChange={(e) => setMinSeeders(Number(e.target.value))}
                  placeholder="0"
                  min="0"
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Max Size</label>
                <input
                  type="text"
                  value={filters.maxSize}
                  onChange={(e) => setMaxSize(e.target.value)}
                  placeholder="e.g. 10GB"
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Order</label>
                <select
                  value={filters.sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  {sortOrders.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{totalResults} results found</p>
        </div>

        {/* Results Table */}
        {results.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/50">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Size
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                      S/L
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                      Date
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/30">
                  {results.map((result, idx) => (
                    <tr
                      key={result.id}
                      className="group animate-fade-in transition-colors hover:bg-slate-800/30"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleBookmark(result.id)}
                            className={cn(
                              'mt-0.5 rounded p-1 transition-colors',
                              bookmarkedIds.has(result.id)
                                ? 'text-amber-400'
                                : 'text-slate-600 hover:text-slate-400',
                            )}
                          >
                            <Bookmark
                              className={cn(
                                'h-4 w-4',
                                bookmarkedIds.has(result.id) && 'fill-current',
                              )}
                            />
                          </button>
                          <div>
                            <p className="line-clamp-1 text-sm font-medium text-slate-200 transition-colors group-hover:text-cyan-300">
                              {result.title}
                            </p>
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
                          <span className="flex items-center gap-1 font-medium text-emerald-400">
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
                          {formatDate(result.date)}
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
                            onClick={() => setSendResult(result)}
                            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:from-emerald-500/30 hover:to-green-500/30"
                          >
                            <Download className="h-4 w-4" />
                            Send
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      />
    </div>
  )
}
