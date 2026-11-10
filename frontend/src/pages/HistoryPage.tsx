import { useMemo, useState, type ReactNode } from 'react'
import {
  Search,
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
  Inbox,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ColumnFilter, EmptyState, LoadingSpinner, ConfirmDialog } from '../components'
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
import { cn, formatDateTime, formatRelative, parseSize } from '../utils'

const PAGE_SIZE_OPTIONS = [25, 50, 100]

const ACTION_LABELS: Record<HistoryAction, string> = {
  sent_to_client: 'Sent to client',
  downloaded_torrent: 'Downloaded .torrent',
}

type SortableColumn = {
  key: HistorySortBy
  label: string
  align?: 'left' | 'center' | 'right'
  defaultOrder?: SortOrder
}

const titleColumn: SortableColumn = {
  key: 'title',
  label: 'Title',
  align: 'left',
  defaultOrder: 'asc',
}
const sizeColumn: SortableColumn = {
  key: 'size_bytes',
  label: 'Size',
  align: 'left',
  defaultOrder: 'desc',
}
const whenColumn: SortableColumn = {
  key: 'occurred_at',
  label: 'When',
  align: 'left',
  defaultOrder: 'desc',
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
  min_size: string
  max_size: string
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
  min_size: '',
  max_size: '',
  sort_by: 'occurred_at',
  sort_order: 'desc',
  limit: 50,
  page: 1,
}

function toApiParams(f: FilterState): HistoryListParams {
  const minBytes = f.min_size ? parseSize(f.min_size) : null
  const maxBytes = f.max_size ? parseSize(f.max_size) : null
  return {
    q: f.q.trim() || undefined,
    action: f.action || undefined,
    source_type: f.source_type || undefined,
    source_instance_id: typeof f.source_instance_id === 'number' ? f.source_instance_id : undefined,
    client_id: typeof f.client_id === 'number' ? f.client_id : undefined,
    status: f.status || undefined,
    since: f.since ? new Date(f.since).toISOString() : undefined,
    until: f.until ? new Date(f.until).toISOString() : undefined,
    min_size_bytes: minBytes ?? undefined,
    max_size_bytes: maxBytes ?? undefined,
    sort_by: f.sort_by,
    sort_order: f.sort_order,
    limit: f.limit,
    offset: (f.page - 1) * f.limit,
  }
}

function ActionBadge({ entry }: { entry: HistoryEntry }) {
  if (entry.status === 'failed') {
    return (
      <span className="tag tag-bad">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  if (entry.action === 'sent_to_client') {
    return (
      <span className="tag tag-good">
        <Send className="h-3 w-3" />
        Sent
      </span>
    )
  }
  return (
    <span className="tag">
      <Download className="h-3 w-3" />
      Downloaded
    </span>
  )
}

function SourceBadge({ entry }: { entry: HistoryEntry }) {
  return (
    <span className="tag" title={entry.source_type === 'jackett' ? 'Jackett' : 'Prowlarr'}>
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
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="First page"
      >
        <ChevronsLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, idx) =>
        p === '…' ? (
          <span key={`gap-${idx}`} className="px-2 text-xs text-slate-500">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              'h-8 min-w-8 rounded-lg px-2 font-mono text-xs transition-colors',
              p === page
                ? 'bg-slate-800 text-cyan-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        onClick={() => onChange(totalPages)}
        disabled={page === totalPages}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Last page"
      >
        <ChevronsRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function HistoryPage() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
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

  const handleSortClick = (column: SortableColumn) => {
    setFilters((prev) => {
      const isActive = prev.sort_by === column.key
      return {
        ...prev,
        sort_by: column.key,
        sort_order: isActive
          ? prev.sort_order === 'asc'
            ? 'desc'
            : 'asc'
          : (column.defaultOrder ?? 'desc'),
        page: 1,
      }
    })
  }

  const resetFilters = () => setFilters(defaultFilters)

  const clearTitle = () => updateFilter('q', '')
  const clearAction = () => {
    setFilters((prev) => ({
      ...prev,
      action: '',
      status: '',
      client_id: '',
      page: 1,
    }))
  }
  const clearSource = () => {
    setFilters((prev) => ({
      ...prev,
      source_type: '',
      source_instance_id: '',
      page: 1,
    }))
  }
  const clearWhen = () => {
    setFilters((prev) => ({
      ...prev,
      since: '',
      until: '',
      page: 1,
    }))
  }
  const clearSize = () => {
    setFilters((prev) => ({
      ...prev,
      min_size: '',
      max_size: '',
      page: 1,
    }))
  }

  const minSizeBytes = filters.min_size ? parseSize(filters.min_size) : null
  const maxSizeBytes = filters.max_size ? parseSize(filters.max_size) : null
  const minSizeInvalid = !!filters.min_size && minSizeBytes === null
  const maxSizeInvalid = !!filters.max_size && maxSizeBytes === null

  const titleFilterActive = !!filters.q
  const actionFilterActive = !!(filters.action || filters.status || filters.client_id !== '')
  const sourceFilterActive = !!(filters.source_type || filters.source_instance_id !== '')
  const whenFilterActive = !!(filters.since || filters.until)
  const sizeFilterActive = !!(filters.min_size || filters.max_size)

  const hasActiveFilters =
    titleFilterActive ||
    actionFilterActive ||
    sourceFilterActive ||
    whenFilterActive ||
    sizeFilterActive

  const activePills: { key: string; label: string; onClear: () => void }[] = []
  if (titleFilterActive) {
    activePills.push({ key: 'q', label: `“${filters.q}”`, onClear: clearTitle })
  }
  if (actionFilterActive) {
    const parts: string[] = []
    if (filters.action) parts.push(ACTION_LABELS[filters.action])
    if (filters.status) parts.push(filters.status === 'success' ? 'Success' : 'Failed')
    if (filters.client_id !== '') {
      const c = (clients ?? []).find((x) => x.id === filters.client_id)
      if (c) parts.push(`→ ${c.name}`)
    }
    activePills.push({
      key: 'action',
      label: parts.join(' · ') || 'Action',
      onClear: clearAction,
    })
  }
  if (sourceFilterActive) {
    const parts: string[] = []
    if (filters.source_type) parts.push(filters.source_type === 'jackett' ? 'Jackett' : 'Prowlarr')
    if (filters.source_instance_id !== '') {
      const allInst = [...(instancesStatus?.jackett ?? []), ...(instancesStatus?.prowlarr ?? [])]
      const inst = allInst.find((i) => i.id === filters.source_instance_id)
      if (inst) parts.push(inst.name)
    }
    activePills.push({
      key: 'source',
      label: parts.join(' · ') || 'Source',
      onClear: clearSource,
    })
  }
  if (whenFilterActive) {
    const fmt = (s: string) => (s ? new Date(s).toLocaleDateString() : '—')
    activePills.push({
      key: 'when',
      label: `${fmt(filters.since)} → ${fmt(filters.until)}`,
      onClear: clearWhen,
    })
  }
  if (sizeFilterActive) {
    const parts: string[] = []
    if (filters.min_size) parts.push(`≥ ${filters.min_size}`)
    if (filters.max_size) parts.push(`≤ ${filters.max_size}`)
    activePills.push({
      key: 'size',
      label: parts.join(' · '),
      onClear: clearSize,
    })
  }

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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium text-slate-100">Download history</h2>
          <p className="text-sm text-slate-400">
            Everything sent to a client or downloaded directly
          </p>
        </div>
        <p className="font-mono text-xs text-slate-500">
          {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
          {isFetching && !isLoading && <span className="ml-2">refreshing…</span>}
        </p>
      </div>

      {/* Active filter pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Filters</span>
          {activePills.map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={pill.onClear}
              className="tag tag-accent group/pill transition-colors hover:bg-cyan-500/10"
              title="Clear this filter"
            >
              {pill.label}
              <X className="h-3 w-3 opacity-60 transition-opacity group-hover/pill:opacity-100" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-slate-400 transition-colors hover:text-slate-100"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 py-16">
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
              ? 'Adjust or clear the filters above'
              : 'Results you send to a client or download as a .torrent appear here'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <SortableTh
                    column={titleColumn}
                    activeSortBy={filters.sort_by}
                    activeSortOrder={filters.sort_order}
                    onClick={handleSortClick}
                    filter={{
                      label: 'Filter by title or query',
                      isActive: titleFilterActive,
                      onClear: clearTitle,
                      panel: (close) => (
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">
                            Title or original query
                          </label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                            <input
                              type="text"
                              value={filters.q}
                              onChange={(e) => updateFilter('q', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="Substring match"
                              autoFocus
                              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 pl-8 pr-2 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      ),
                    }}
                  />
                  <FilterableTh
                    label="Action"
                    filter={{
                      panelLabel: 'Filter by action, status, or client',
                      isActive: actionFilterActive,
                      onClear: clearAction,
                      panelWidthClass: 'w-64',
                      panel: () => (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Action</label>
                            <select
                              value={filters.action}
                              onChange={(e) =>
                                updateFilter('action', e.target.value as HistoryAction | '')
                              }
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="">All actions</option>
                              <option value="sent_to_client">Sent to client</option>
                              <option value="downloaded_torrent">Downloaded .torrent</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Status</label>
                            <select
                              value={filters.status}
                              onChange={(e) =>
                                updateFilter('status', e.target.value as HistoryStatus | '')
                              }
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="">Any</option>
                              <option value="success">Success</option>
                              <option value="failed">Failed</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Client</label>
                            <select
                              value={filters.client_id}
                              onChange={(e) =>
                                updateFilter(
                                  'client_id',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="">All clients</option>
                              {(clients ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ),
                    }}
                  />
                  <FilterableTh
                    label="Source"
                    filter={{
                      panelLabel: 'Filter by source type or instance',
                      isActive: sourceFilterActive,
                      onClear: clearSource,
                      panelWidthClass: 'w-64',
                      panel: () => (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Source type</label>
                            <select
                              value={filters.source_type}
                              onChange={(e) =>
                                updateFilter('source_type', e.target.value as SourceType | '')
                              }
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="">All sources</option>
                              <option value="jackett">Jackett</option>
                              <option value="prowlarr">Prowlarr</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Instance</label>
                            <select
                              value={filters.source_instance_id}
                              onChange={(e) =>
                                updateFilter(
                                  'source_instance_id',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                              className="h-8 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            >
                              <option value="">All instances</option>
                              {allInstances.map((i) => (
                                <option key={`${i.type}-${i.id}`} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ),
                    }}
                  />
                  <th className="px-4 py-2 text-left text-xs font-normal text-slate-500">
                    Indexer
                  </th>
                  <SortableTh
                    column={sizeColumn}
                    activeSortBy={filters.sort_by}
                    activeSortOrder={filters.sort_order}
                    onClick={handleSortClick}
                    filter={{
                      label: 'Filter by size range',
                      isActive: sizeFilterActive,
                      onClear: clearSize,
                      panelWidthClass: 'w-64',
                      panel: (close) => (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Min size</label>
                            <input
                              type="text"
                              value={filters.min_size}
                              onChange={(e) => updateFilter('min_size', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="500MB"
                              autoFocus
                              className={cn(
                                'h-8 w-full rounded-lg border bg-slate-800 px-2 font-mono text-sm text-slate-200 placeholder-slate-500 focus:outline-none',
                                minSizeInvalid
                                  ? 'border-red-500/60 focus:border-red-400'
                                  : 'border-slate-700 focus:border-cyan-500',
                              )}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">Max size</label>
                            <input
                              type="text"
                              value={filters.max_size}
                              onChange={(e) => updateFilter('max_size', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') close()
                              }}
                              placeholder="10GB"
                              className={cn(
                                'h-8 w-full rounded-lg border bg-slate-800 px-2 font-mono text-sm text-slate-200 placeholder-slate-500 focus:outline-none',
                                maxSizeInvalid
                                  ? 'border-red-500/60 focus:border-red-400'
                                  : 'border-slate-700 focus:border-cyan-500',
                              )}
                            />
                          </div>
                          <p
                            className={cn(
                              'text-2xs',
                              minSizeInvalid || maxSizeInvalid ? 'text-red-300' : 'text-slate-500',
                            )}
                          >
                            {minSizeInvalid || maxSizeInvalid
                              ? 'Use a unit like KB, MB, GB or TB'
                              : 'Leave a field empty to skip that bound'}
                          </p>
                        </div>
                      ),
                    }}
                  />
                  <SortableTh
                    column={whenColumn}
                    activeSortBy={filters.sort_by}
                    activeSortOrder={filters.sort_order}
                    onClick={handleSortClick}
                    filter={{
                      label: 'Filter by date range',
                      isActive: whenFilterActive,
                      onClear: clearWhen,
                      panelWidthClass: 'w-64',
                      panel: () => (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">From</label>
                            <input
                              type="datetime-local"
                              value={filters.since}
                              onChange={(e) => updateFilter('since', e.target.value)}
                              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-slate-400">To</label>
                            <input
                              type="datetime-local"
                              value={filters.until}
                              onChange={(e) => updateFilter('until', e.target.value)}
                              className="h-8 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      ),
                    }}
                  />
                  <th className="px-4 py-2 text-right text-xs font-normal text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-slate-800 transition-colors first:border-t-0 hover:bg-slate-800/50"
                  >
                    <td className="w-full max-w-0 px-4 py-3">
                      {entry.info_url ? (
                        <a
                          href={entry.info_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm text-slate-100 transition-colors hover:text-cyan-300"
                          title={entry.title}
                        >
                          {entry.title}
                        </a>
                      ) : (
                        <p className="truncate text-sm text-slate-100" title={entry.title}>
                          {entry.title}
                        </p>
                      )}
                      {entry.search_query && (
                        <p className="mt-1 truncate text-2xs text-slate-500">
                          from search <span className="text-slate-400">{entry.search_query}</span>
                        </p>
                      )}
                      {entry.status === 'failed' && entry.error_message && (
                        <p
                          className="mt-1 truncate text-2xs text-red-400"
                          title={entry.error_message}
                        >
                          {entry.error_message}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ActionBadge entry={entry} />
                        {entry.client_name && (
                          <span className="text-2xs text-slate-500">{entry.client_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SourceBadge entry={entry} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                      {entry.indexer}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-300">
                      {entry.size_formatted || '-'}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm text-slate-400"
                      title={formatDateTime(entry.occurred_at)}
                    >
                      {formatRelative(entry.occurred_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {entry.info_url && (
                          <a
                            href={entry.info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                            title="Open info page"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => copyMagnet(entry)}
                          disabled={!entry.magnet_link}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          title={entry.magnet_link ? 'Copy magnet' : 'No magnet stored'}
                        >
                          <Magnet className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setPendingDelete(entry)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
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
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Page <span className="font-mono text-slate-300">{filters.page}</span> of{' '}
                <span className="font-mono text-slate-300">{totalPages}</span>
              </span>
              <span className="text-slate-600">·</span>
              <label className="flex items-center gap-2">
                <span>Rows</span>
                <select
                  value={filters.limit}
                  onChange={(e) => updateFilter('limit', Number(e.target.value))}
                  className="h-8 cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 font-mono text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
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

interface SortableThProps {
  column: SortableColumn
  activeSortBy: HistorySortBy
  activeSortOrder: SortOrder
  onClick: (column: SortableColumn) => void
  filter?: {
    isActive: boolean
    label: string
    panel: (close: () => void) => ReactNode
    onClear: () => void
    panelWidthClass?: string
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
      className={cn('px-4 py-2 text-xs font-normal', textAlign)}
    >
      <div className={cn('group/cell flex items-center gap-1', justify)}>
        <button
          type="button"
          onClick={() => onClick(column)}
          className={cn(
            'inline-flex items-center gap-1 rounded transition-colors',
            isActive ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-100',
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
            panelWidthClass={filter.panelWidthClass}
          />
        )}
      </div>
    </th>
  )
}

function FilterableTh({
  label,
  align = 'left',
  filter,
}: {
  label: string
  align?: 'left' | 'center' | 'right'
  filter: {
    isActive: boolean
    panelLabel: string
    panel: (close: () => void) => ReactNode
    onClear: () => void
    panelWidthClass?: string
  }
}) {
  const justify =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
  const textAlign =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

  return (
    <th scope="col" className={cn('px-4 py-2 text-xs font-normal', textAlign)}>
      <div className={cn('group/cell flex items-center gap-1', justify)}>
        <span className="text-slate-500">{label}</span>
        <ColumnFilter
          label={filter.panelLabel}
          isActive={filter.isActive}
          panel={filter.panel}
          onClear={filter.onClear}
          panelWidthClass={filter.panelWidthClass}
        />
      </div>
    </th>
  )
}
