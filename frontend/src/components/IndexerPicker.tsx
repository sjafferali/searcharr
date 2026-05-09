import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Database, Lock, Globe, Search, Zap, Layers } from 'lucide-react'
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
    return {
      label: 'Private',
      icon: Lock,
      className: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    }
  }
  if (lower.includes('public')) {
    return {
      label: 'Public',
      icon: Globe,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    }
  }
  return {
    label: type,
    icon: Database,
    className: 'border-slate-600/40 bg-slate-700/40 text-slate-300',
  }
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

  const accent = isJackett
    ? 'text-amber-300 hover:text-amber-200'
    : 'text-cyan-300 hover:text-cyan-200'
  const iconAccent = isJackett ? 'text-amber-400' : 'text-cyan-400'
  const Icon = isJackett ? Zap : Database

  return (
    <div
      className={cn(
        'rounded-lg border bg-slate-900/40 transition-colors',
        isFiltered
          ? isJackett
            ? 'border-amber-500/30 shadow-[0_0_0_1px_rgba(251,191,36,0.05)]'
            : 'border-cyan-500/30 shadow-[0_0_0_1px_rgba(34,211,238,0.05)]'
          : 'border-slate-800/60',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-800/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={cn('h-4 w-4 flex-shrink-0', iconAccent)} />
          <span className="truncate text-sm font-medium text-slate-200">{instanceName}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
              isFiltered
                ? isJackett
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                  : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700/50 bg-slate-800/60 text-slate-400',
            )}
          >
            <Layers className="h-3 w-3" />
            {summary}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60 p-3">
          {query.isLoading && (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <LoadingSpinner size="sm" />
              <span className="ml-2 text-xs">Loading indexers…</span>
            </div>
          )}

          {query.isError && (
            <p className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              Failed to load indexers. Verify the instance is online.
            </p>
          )}

          {query.isSuccess && totalCount === 0 && (
            <p className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs text-slate-400">
              No indexers configured on this instance.
            </p>
          )}

          {query.isSuccess && totalCount > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[140px] flex-1">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter indexers"
                    className="w-full rounded-md border border-slate-700/50 bg-slate-800/40 py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={selectedIds.length === 0}
                  className={cn(
                    'rounded-md border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-slate-800/70 disabled:cursor-default disabled:opacity-50',
                    accent,
                  )}
                  title="Reset to default — search every indexer on this instance"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => onSetSelection(indexers.map((i) => i.id))}
                  className="rounded-md border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-800/70"
                  title="Mark every indexer as selected"
                >
                  Select all
                </button>
              </div>

              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
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
                        'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-all',
                        isSelected
                          ? isJackett
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                          : 'border-slate-700/50 bg-slate-800/30 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60',
                      )}
                    >
                      <span className="truncate">{indexer.name}</span>
                      {badge && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium',
                            badge.className,
                          )}
                        >
                          <badge.icon className="h-2.5 w-2.5" />
                          {badge.label}
                        </span>
                      )}
                    </button>
                  )
                })}
                {filteredIndexers.length === 0 && (
                  <p className="col-span-full rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs text-slate-500">
                    No indexers match “{filter}”.
                  </p>
                )}
              </div>

              <p className="text-[11px] text-slate-500">
                {selectedCount === 0
                  ? `Searches all ${totalCount} indexers on this instance.`
                  : `Searches only the ${selectedCount} selected indexer${selectedCount === 1 ? '' : 's'}.`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
