import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { cn } from '../utils'
import { useJackettIndexers, useProwlarrIndexers } from '../hooks'
import { LoadingSpinner } from './LoadingSpinner'
import { SourceType, IndexerInfo } from '../types'

interface IndexerPickerProps {
  instanceId: number
  instanceName: string
  type: SourceType
  selectedIds: string[]
  onToggle: (indexerId: string) => void
  onSetSelection: (indexerIds: string[]) => void
  onClearSelection: () => void
}

function indexerTypeBadge(type: string | null | undefined) {
  if (!type) return null
  const lower = type.toLowerCase()
  if (lower.includes('private')) {
    return { label: 'Private' }
  }
  if (lower.includes('public')) {
    return { label: 'Public' }
  }
  return { label: type }
}

export function IndexerPicker({
  instanceId,
  instanceName,
  type,
  selectedIds,
  onToggle,
  onSetSelection,
  onClearSelection,
}: IndexerPickerProps) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState('')

  const isJackett = type === 'jackett'
  const jackettQuery = useJackettIndexers(isJackett ? instanceId : null, isJackett && expanded)
  const prowlarrQuery = useProwlarrIndexers(!isJackett ? instanceId : null, !isJackett && expanded)
  const query = isJackett ? jackettQuery : prowlarrQuery

  const indexers: IndexerInfo[] = useMemo(() => query.data?.indexers ?? [], [query.data])
  const filteredIndexers = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return indexers
    return indexers.filter((i) => i.name.toLowerCase().includes(term))
  }, [indexers, filter])

  const totalCount = indexers.length
  const selectedCount = selectedIds.length
  const isFiltered = selectedCount > 0
  const summary = isFiltered
    ? `${selectedCount} of ${totalCount || '?'} indexers`
    : totalCount
      ? `All ${totalCount} indexers`
      : 'All indexers'

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isFiltered ? 'border-cyan-500/40' : 'border-slate-800',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-800/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-200">{instanceName}</span>
          <span className={cn('tag', isFiltered && 'tag-accent')}>{summary}</span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-800 p-3">
          {query.isLoading && (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <LoadingSpinner size="sm" />
              <span className="ml-2 text-xs">Loading indexers…</span>
            </div>
          )}

          {query.isError && (
            <p className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300">
              Failed to load indexers. Verify the instance is online.
            </p>
          )}

          {query.isSuccess && totalCount === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              No indexers configured on this instance
            </p>
          )}

          {query.isSuccess && totalCount > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[140px] flex-1">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter indexers"
                    className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 pl-7 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={selectedIds.length === 0}
                  className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                  title="Reset to default — search every indexer on this instance"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => onSetSelection(indexers.map((i) => i.id))}
                  className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                  title="Mark every indexer as selected"
                >
                  Select all
                </button>
              </div>

              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredIndexers.map((indexer) => {
                  const isSelected =
                    selectedIds.length === 0 ? false : selectedIds.includes(indexer.id)
                  const badge = indexerTypeBadge(indexer.type)
                  return (
                    <button
                      key={indexer.id}
                      type="button"
                      onClick={() => onToggle(indexer.id)}
                      className={cn(
                        'flex h-8 items-center justify-between gap-2 rounded-lg border px-3 text-left text-xs transition-colors',
                        isSelected
                          ? 'border-cyan-500/50 bg-slate-800 text-slate-100'
                          : 'border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50',
                      )}
                    >
                      <span className="truncate">{indexer.name}</span>
                      {badge && (
                        <span className="flex-shrink-0 text-2xs text-slate-500">{badge.label}</span>
                      )}
                    </button>
                  )
                })}
                {filteredIndexers.length === 0 && (
                  <p className="col-span-full px-3 py-2 text-xs text-slate-500">
                    No indexers match “{filter}”
                  </p>
                )}
              </div>

              <p className="text-2xs text-slate-500">
                {selectedCount === 0
                  ? `Searches all ${totalCount} indexers on this instance`
                  : `Searches only the ${selectedCount} selected indexer${selectedCount === 1 ? '' : 's'}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
