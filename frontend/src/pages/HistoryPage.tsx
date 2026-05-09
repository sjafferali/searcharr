import { useMemo, useState } from 'react'
import {
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  ExternalLink,
  Magnet,
  Download,
  Send,
  XCircle,
  Zap,
  Database,
  Clock,
  HardDrive,
  Inbox,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { EmptyState, LoadingSpinner, ConfirmDialog } from '../components'
import { useHistory, useDeleteHistoryEntry, useInstancesStatus, useClientsStatus } from '../hooks'
import {
  HistoryAction,
  HistoryEntry,
  HistoryListParams,
  HistorySortBy,
  HistoryStatus,
  SortOrder,
  SourceType,
} from '../types'
import { cn, formatDateTime, formatRelative } from '../utils'

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const ACTION_LABELS: Record<HistoryAction, string> = {
  sent_to_client: 'Sent to client',
  downloaded_torrent: 'Downloaded .torrent',
}

interface FilterState {
  q: string
  action: HistoryAction | ''
  source_type: SourceType | ''
  source_instance_id: number | ''
  client_id: number | ''
  status: HistoryStatus | ''
  since: string
  until: string
  sort_by: HistorySortBy
  sort_order: SortOrder
  limit: number
  page: number
}

const defaultFilters: FilterState = {
  q: '',
  action: '',
  source_type: '',
  source_instance_id: '',
  client_id: '',
  status: '',
  since: '',
  until: '',
  sort_by: 'occurred_at',
  sort_order: 'desc',
  limit: 50,
  page: 1,
}

function toApiParams(f: FilterState): HistoryListParams {
  return {
    q: f.q.trim() || undefined,
    action: f.action || undefined,
    source_type: f.source_type || undefined,
    source_instance_id: typeof f.source_instance_id === 'number' ? f.source_instance_id : undefined,
    client_id: typeof f.client_id === 'number' ? f.client_id : undefined,
    status: f.status || undefined,
    since: f.since ? new Date(f.since).toISOString() : undefined,
    until: f.until ? new Date(f.until).toISOString() : undefined,
    sort_by: f.sort_by,
    sort_order: f.sort_order,
    limit: f.limit,
    offset: (f.page - 1) * f.limit,
  }
}

function ActionBadge({ entry }: { entry: HistoryEntry }) {
  if (entry.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  if (entry.action === 'sent_to_client') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
        <Send className="h-3 w-3" />
        Sent
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-400">
      <Download className="h-3 w-3" />
      Downloaded
    </span>
  )
}

function SourceBadge({ entry }: { entry: HistoryEntry }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium',
        entry.source_type === 'jackett'
          ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
          : 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
      )}
    >
      {entry.source_type === 'jackett' ? (
        <Zap className="h-3 w-3" />
      ) : (
        <Database className="h-3 w-3" />
      )}
      {entry.source_instance_name}
    </span>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  const pages: (number | '…')[] = []
  const maxButtons = 7
  if (totalPages <= maxButtons) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(1)}
        disabled={page === 1}
        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
        title="First page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
        title="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, idx) =>
        p === '…' ? (
          <span key={`gap-${idx}`} className="px-2 text-xs text-slate-600">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              'min-w-[32px] rounded px-2 py-1 text-xs font-medium transition-colors',
              p === page
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
        title="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange(totalPages)}
        disabled={page === totalPages}
        className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
        title="Last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function HistoryPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<HistoryEntry | null>(null)

  const apiParams = useMemo(() => toApiParams(filters), [filters])
  const { data, isLoading, isFetching, isError } = useHistory(apiParams)
  const { data: instancesStatus } = useInstancesStatus()
  const { data: clients } = useClientsStatus()
  const deleteEntry = useDeleteHistoryEntry()

  const total = data?.total ?? 0
  const entries = data?.entries ?? []
  const totalPages = Math.max(1, Math.ceil(total / filters.limit))

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      // Any filter change resets to page 1, except explicit page changes.
      page: key === 'page' || key === 'limit' ? prev.page : 1,
    }))
  }

  const resetFilters = () => setFilters(defaultFilters)

  const hasActiveFilters =
    filters.q ||
    filters.action ||
    filters.source_type ||
    filters.source_instance_id !== '' ||
    filters.client_id !== '' ||
    filters.status ||
    filters.since ||
    filters.until

  const allInstances = [
    ...(instancesStatus?.jackett ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      type: 'jackett' as const,
    })),
    ...(instancesStatus?.prowlarr ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      type: 'prowlarr' as const,
    })),
  ]

  const copyMagnet = async (entry: HistoryEntry) => {
    if (!entry.magnet_link) {
      toast.error('No magnet link saved for this entry')
      return
    }
    try {
      await navigator.clipboard.writeText(entry.magnet_link)
      toast.success('Magnet link copied to clipboard')
    } catch {
      toast.error('Failed to copy magnet link')
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteEntry.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      // Error toast handled by mutation
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/25">
              <History className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                Download History
              </h2>
              <p className="text-xs text-slate-500">
                Everything you've sent to a client or downloaded directly
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-mono text-slate-200">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'entry' : 'entries'}
          {isFetching && !isLoading && (
            <span className="ml-2 inline-block animate-pulse text-cyan-400">refreshing…</span>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
        <button
          onClick={() => setFiltersExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800/30"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-cyan-400" />
            Filters
            {hasActiveFilters && (
              <span className="ml-2 rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                Active
              </span>
            )}
          </span>
          {filtersExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {filtersExpanded && (
          <div className="space-y-4 border-t border-slate-800/50 px-4 pb-4 pt-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={filters.q}
                onChange={(e) => updateFilter('q', e.target.value)}
                placeholder="Search by title or original query…"
                className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 py-2.5 pl-10 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>

            {/* Filter selects */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Action
                </label>
                <select
                  value={filters.action}
                  onChange={(e) => updateFilter('action', e.target.value as HistoryAction | '')}
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="">All actions</option>
                  <option value="sent_to_client">Sent to client</option>
                  <option value="downloaded_torrent">Downloaded .torrent</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter('status', e.target.value as HistoryStatus | '')}
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="">Any</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Source Type
                </label>
                <select
                  value={filters.source_type}
                  onChange={(e) => updateFilter('source_type', e.target.value as SourceType | '')}
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="">All sources</option>
                  <option value="jackett">Jackett</option>
                  <option value="prowlarr">Prowlarr</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Instance
                </label>
                <select
                  value={filters.source_instance_id}
                  onChange={(e) =>
                    updateFilter(
                      'source_instance_id',
                      e.target.value === '' ? '' : Number(e.target.value),
                    )
                  }
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="">All instances</option>
                  {allInstances.map((i) => (
                    <option key={`${i.type}-${i.id}`} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Client
                </label>
                <select
                  value={filters.client_id}
                  onChange={(e) =>
                    updateFilter('client_id', e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="">All clients</option>
                  {(clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  From
                </label>
                <input
                  type="datetime-local"
                  value={filters.since}
                  onChange={(e) => updateFilter('since', e.target.value)}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  To
                </label>
                <input
                  type="datetime-local"
                  value={filters.until}
                  onChange={(e) => updateFilter('until', e.target.value)}
                  className="w-full rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Sort
                </label>
                <div className="flex gap-2">
                  <select
                    value={filters.sort_by}
                    onChange={(e) => updateFilter('sort_by', e.target.value as HistorySortBy)}
                    className="flex-1 cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="occurred_at">Date</option>
                    <option value="title">Title</option>
                    <option value="size_bytes">Size</option>
                  </select>
                  <select
                    value={filters.sort_order}
                    onChange={(e) => updateFilter('sort_order', e.target.value as SortOrder)}
                    className="cursor-pointer rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="desc">↓</option>
                    <option value="asc">↑</option>
                  </select>
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  onClick={resetFilters}
                  className="text-xs font-medium text-slate-400 transition-colors hover:text-cyan-300"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800/50 bg-slate-900/50 py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
          Failed to load history. Please try again.
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-12 w-12" />}
          title={hasActiveFilters ? 'No entries match these filters' : 'No download history yet'}
          description={
            hasActiveFilters
              ? 'Try adjusting or clearing the filters above.'
              : 'Send a result to a download client or download a .torrent — it will appear here.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Indexer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    When
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className="group animate-fade-in transition-colors hover:bg-slate-800/30"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <td className="max-w-md px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        {entry.info_url ? (
                          <a
                            href={entry.info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 transition-colors hover:text-cyan-300"
                          >
                            <span className="line-clamp-1">{entry.title}</span>
                            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100" />
                          </a>
                        ) : (
                          <span className="line-clamp-1 text-sm font-medium text-slate-200">
                            {entry.title}
                          </span>
                        )}
                        {entry.search_query && (
                          <span className="text-[11px] text-slate-500">
                            from search:{' '}
                            <span className="text-slate-400">{entry.search_query}</span>
                          </span>
                        )}
                        {entry.status === 'failed' && entry.error_message && (
                          <span className="line-clamp-1 text-[11px] text-red-400/80">
                            {entry.error_message}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <ActionBadge entry={entry} />
                        {entry.client_name && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <HardDrive className="h-3 w-3" />
                            {entry.client_name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SourceBadge entry={entry} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-slate-400">{entry.indexer}</td>
                    <td className="px-4 py-3 align-top font-mono text-sm text-slate-300">
                      {entry.size_formatted || '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-slate-400">
                      <div
                        className="flex items-center gap-1.5"
                        title={formatDateTime(entry.occurred_at)}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelative(entry.occurred_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-2">
                        {entry.info_url && (
                          <a
                            href={entry.info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-cyan-400"
                            title="Open info page"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => copyMagnet(entry)}
                          disabled={!entry.magnet_link}
                          className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                          title={entry.magnet_link ? 'Copy magnet' : 'No magnet stored'}
                        >
                          <Magnet className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(entry)}
                          className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-red-500/20 hover:text-red-400"
                          title="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer / pagination */}
          <div className="flex items-center justify-between border-t border-slate-800/50 px-4 py-3">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Page <span className="font-mono text-slate-300">{filters.page}</span> of{' '}
                <span className="font-mono text-slate-300">{totalPages}</span>
              </span>
              <span className="text-slate-700">·</span>
              <label className="flex items-center gap-2">
                <span>Rows:</span>
                <select
                  value={filters.limit}
                  onChange={(e) => updateFilter('limit', Number(e.target.value))}
                  className="cursor-pointer rounded border border-slate-700/50 bg-slate-800/50 px-2 py-1 text-xs text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              onChange={(p) => updateFilter('page', p)}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete history entry?"
        message={
          pendingDelete
            ? `Remove "${pendingDelete.title}" (${ACTION_LABELS[pendingDelete.action]}) from history? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        isLoading={deleteEntry.isPending}
      />
    </div>
  )
}
