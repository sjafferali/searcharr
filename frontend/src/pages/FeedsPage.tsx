import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Database,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  Filter as FilterIcon,
  Layers,
  Magnet,
  PauseCircle,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Rss,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ColumnFilter,
  ConfirmDialog,
  DownloadedBadge,
  EmptyState,
  FeedEditorModal,
  IndexerErrorBanner,
  LoadingSpinner,
  SendToClientModal,
} from '../components'
import {
  useBookmarkLookup,
  useClientsStatus,
  useDeleteFeed,
  useFeedItems,
  useFeedNewCounts,
  useFeeds,
  useHistoryLookup,
  useInstancesStatus,
  useLogHistory,
  useRefreshFeed,
  useSendToClient,
  useToggleResultBookmark,
} from '../hooks'
import {
  Feed,
  FeedItem,
  FeedItemListParams,
  FeedItemSortBy,
  SearchCategory,
  SearchResult,
  SortOrder,
} from '../types'
import {
  cn,
  formatAge,
  formatBytes,
  formatDateTime,
  formatRelative,
  markFeedViewed,
  touchFeedLastViewed,
} from '../utils'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const
const DEFAULT_PAGE_SIZE = 25
const SIDEBAR_STATE_KEY = 'feeds.sidebarCollapsed'
const PAGE_SIZE_STATE_KEY = 'feeds.pageSize'

type SortableColumnKey = FeedItemSortBy

interface SortableColumn {
  key: SortableColumnKey
  label: string
  align?: 'left' | 'center' | 'right'
  defaultOrder: SortOrder
}

const titleColumn: SortableColumn = {
  key: 'title',
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
const pubDateColumn: SortableColumn = {
  key: 'pub_date',
  label: 'Age',
  align: 'left',
  defaultOrder: 'desc',
}
const lastSeenColumn: SortableColumn = {
  key: 'last_seen',
  label: 'Seen',
  align: 'left',
  defaultOrder: 'desc',
}
const firstSeenColumn: SortableColumn = {
  key: 'first_seen',
  label: 'Added',
  align: 'left',
  defaultOrder: 'desc',
}

function filterChips(feed: Feed): { label: string; tone: 'normal' | 'highlight' }[] {
  const chips: { label: string; tone: 'normal' | 'highlight' }[] = []
  const f = feed.filters
  if (f.category && f.category !== ('All' as SearchCategory)) {
    chips.push({ label: f.category, tone: 'normal' })
  }
  if (f.freeleech_only) chips.push({ label: 'Freeleech only', tone: 'highlight' })
  if (f.min_seeders > 0) chips.push({ label: `≥ ${f.min_seeders} seeders`, tone: 'normal' })
  if (f.min_size_bytes !== null) {
    chips.push({ label: `≥ ${formatBytes(f.min_size_bytes)}`, tone: 'normal' })
  }
  if (f.max_size_bytes !== null) {
    chips.push({ label: `≤ ${formatBytes(f.max_size_bytes)}`, tone: 'normal' })
  }
  if (f.include_regex) chips.push({ label: `match /${f.include_regex}/`, tone: 'normal' })
  if (f.exclude_regex) chips.push({ label: `skip /${f.exclude_regex}/`, tone: 'normal' })
  return chips
}

function freshnessTone(item: FeedItem, staleAfterSeconds: number): string {
  const ageSec = (Date.now() - new Date(item.last_seen_at).getTime()) / 1000
  if (ageSec < 1800) {
    return 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]'
  }
  if (ageSec < staleAfterSeconds) {
    return 'bg-slate-400'
  }
  return 'bg-slate-700'
}

function isStale(item: FeedItem, staleAfterSeconds: number): boolean {
  const ageSec = (Date.now() - new Date(item.last_seen_at).getTime()) / 1000
  return ageSec >= staleAfterSeconds
}

function formatHoursDuration(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round((seconds / 3600) * 10) / 10
  if (hours < 24) return `${hours}h`
  const days = Math.round(seconds / 86400)
  return `${days}d`
}

/**
 * Returns the "new since" baseline timestamp for the given feed: the moment
 * the user last opened it. Items whose ``first_seen_at`` is newer than the
 * baseline are flagged NEW.
 *
 * Opening a feed records the current time as its new "last opened" value
 * (persisted eagerly so the NEW state survives a reload) and notifies the
 * feeds sidebar so the feed's NEW-count badge clears. The returned baseline
 * is captured once per feed per session so flagged rows stay flagged while
 * the feed is being viewed. See {@link markFeedViewed}.
 */
function useLastViewedBaseline(feedId: number | null): number | null {
  const [baseline, setBaseline] = useState<number | null>(null)

  useEffect(() => {
    if (feedId === null) {
      setBaseline(null)
      return
    }
    setBaseline(markFeedViewed(feedId))
  }, [feedId])

  return baseline
}

function nextPollLabel(nextPollAt: string | null, pollingEnabled: boolean): string | null {
  if (!pollingEnabled) return null
  if (!nextPollAt) return 'soon'
  const ms = new Date(nextPollAt).getTime() - Date.now()
  if (ms <= 0) return 'imminent'
  return `in ${formatHoursDuration(Math.round(ms / 1000))}`
}

export function FeedsPage() {
  const { data: feedsData, isLoading: feedsLoading, isError: feedsError } = useFeeds()
  const { data: instancesStatus } = useInstancesStatus()
  const { data: clientsStatus } = useClientsStatus()
  const sendToClient = useSendToClient()
  const logHistory = useLogHistory()
  const deleteFeed = useDeleteFeed()
  const refreshFeed = useRefreshFeed()

  const feeds = useMemo(() => feedsData?.entries ?? [], [feedsData])
  const newCounts = useFeedNewCounts(feeds)

  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Feed | null>(null)
  const [sendResult, setSendResult] = useState<SearchResult | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_STATE_KEY) === '1'
  })
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
    const stored = window.localStorage.getItem(PAGE_SIZE_STATE_KEY)
    const parsed = stored ? Number(stored) : NaN
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_STATE_KEY, sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PAGE_SIZE_STATE_KEY, String(pageSize))
  }, [pageSize])

  // Filters / sort state. Reset on feed-change.
  const [sortBy, setSortBy] = useState<SortableColumnKey>('last_seen')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [freeleechOnly, setFreeleechOnly] = useState(false)
  const [minSeedersFilter, setMinSeedersFilter] = useState(0)
  const [maxSizeFilter, setMaxSizeFilter] = useState<number | null>(null)
  const [seenWithinHours, setSeenWithinHours] = useState<number | null>(null)
  const [firstSeenWithinHours, setFirstSeenWithinHours] = useState<number | null>(null)
  const [hideStale, setHideStale] = useState(true)
  const [hideDead, setHideDead] = useState(true)
  const [showNewOnly, setShowNewOnly] = useState(true)
  const [offset, setOffset] = useState(0)

  // Auto-select first feed when feeds load and none is selected; clear on delete.
  useEffect(() => {
    if (selectedFeedId === null && feeds.length > 0) {
      setSelectedFeedId(feeds[0].id)
    }
    if (selectedFeedId !== null && !feeds.some((f) => f.id === selectedFeedId)) {
      setSelectedFeedId(feeds.length > 0 ? feeds[0].id : null)
    }
  }, [feeds, selectedFeedId])

  const selectedFeed = useMemo(
    () => feeds.find((f) => f.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId],
  )

  const lastViewedBaseline = useLastViewedBaseline(selectedFeedId)
  // "New" is meaningful only once a prior visit has been recorded; until then
  // there's nothing to compare against, so the "new only" filter is hidden.
  const canFilterNew = lastViewedBaseline !== null && lastViewedBaseline > 0

  // Resetting filters when the selected feed changes keeps the UX coherent —
  // a saved feed's own filters already shape what's persisted; transient UI
  // filters here are layered on top and shouldn't leak between feeds.
  useEffect(() => {
    setSortBy('last_seen')
    setSortOrder('desc')
    setFreeleechOnly(false)
    setMinSeedersFilter(0)
    setMaxSizeFilter(null)
    setSeenWithinHours(null)
    setFirstSeenWithinHours(null)
    setHideStale(true)
    setHideDead(true)
    setShowNewOnly(true)
    setOffset(0)
  }, [selectedFeedId])

  // Reset offset when any filter, sort, or page size changes (stay in sync with the server)
  useEffect(() => {
    setOffset(0)
  }, [
    sortBy,
    sortOrder,
    freeleechOnly,
    minSeedersFilter,
    maxSizeFilter,
    seenWithinHours,
    firstSeenWithinHours,
    hideStale,
    hideDead,
    showNewOnly,
    pageSize,
  ])

  // "New only" is the user's primary intent when active and takes precedence
  // over the implicit stale/dead filters, so every row the table flags NEW —
  // and that the sidebar badge counts — is visible. Explicit per-column filters
  // (a user-set min_seeders, or a chosen "seen within" window) still apply on
  // top so manual narrowing is never suppressed.
  const newOnlyActive = showNewOnly && canFilterNew

  const effectiveSeenWithin = useMemo(() => {
    if (seenWithinHours !== null) return seenWithinHours
    if (newOnlyActive) return undefined
    if (hideStale && selectedFeed) {
      return Math.max(1, Math.ceil(selectedFeed.stale_after_seconds / 3600))
    }
    return undefined
  }, [seenWithinHours, hideStale, selectedFeed, newOnlyActive])

  // "Hide dead items" composes with the explicit min-seeders column filter:
  // whichever floor is higher wins, so a user-set minimum is never lowered.
  const effectiveMinSeeders = useMemo(() => {
    const base = minSeedersFilter > 0 ? minSeedersFilter : 0
    if (base > 0) return base
    if (newOnlyActive) return 0
    return hideDead ? 1 : 0
  }, [minSeedersFilter, hideDead, newOnlyActive])

  // When the "new only" filter is active, ask the server for items first seen
  // after the visit baseline — matching the rows the table flags NEW.
  const newOnlyCutoff = useMemo(() => {
    if (!newOnlyActive) return undefined
    return new Date(lastViewedBaseline as number).toISOString()
  }, [newOnlyActive, lastViewedBaseline])

  const itemsParams: FeedItemListParams = useMemo(
    () => ({
      limit: pageSize,
      offset,
      sort_by: sortBy,
      sort_order: sortOrder,
      freeleech_only: freeleechOnly || undefined,
      min_seeders: effectiveMinSeeders > 0 ? effectiveMinSeeders : undefined,
      max_size_bytes: maxSizeFilter ?? undefined,
      seen_within_hours: effectiveSeenWithin,
      first_seen_within_hours: firstSeenWithinHours ?? undefined,
      first_seen_after: newOnlyCutoff,
    }),
    [
      pageSize,
      offset,
      sortBy,
      sortOrder,
      freeleechOnly,
      effectiveMinSeeders,
      maxSizeFilter,
      effectiveSeenWithin,
      firstSeenWithinHours,
      newOnlyCutoff,
    ],
  )

  const itemsQuery = useFeedItems(selectedFeedId, itemsParams)
  const entries = itemsQuery.data?.entries ?? []

  // Each successful items fetch is the user "seeing" the current contents of
  // the feed; advance the persisted last-viewed stamp so the next session's
  // NEW baseline excludes items the user already saw via background polls.
  // The in-session NEW flags don't move, since they read the frozen session
  // baseline captured by markFeedViewed.
  const itemsUpdatedAt = itemsQuery.dataUpdatedAt
  useEffect(() => {
    if (selectedFeedId === null) return
    if (!itemsUpdatedAt) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    touchFeedLastViewed(selectedFeedId)
  }, [selectedFeedId, itemsUpdatedAt])

  const total = itemsQuery.data?.total ?? 0
  const totalInHistory = itemsQuery.data?.total_in_history ?? 0
  const lastPolledAt = itemsQuery.data?.last_polled_at ?? selectedFeed?.last_polled_at ?? null
  const nextPollAt = itemsQuery.data?.next_poll_at ?? null
  const staleAfterSeconds =
    itemsQuery.data?.stale_after_seconds ?? selectedFeed?.stale_after_seconds ?? 3600
  const pollingEnabled = itemsQuery.data?.polling_enabled ?? selectedFeed?.polling_enabled ?? true
  const sourceErrors = itemsQuery.data?.source_errors ?? selectedFeed?.last_poll_errors ?? []

  const { matchesByResultId } = useHistoryLookup(entries)
  const { bookmarkIdByResultId } = useBookmarkLookup(entries)
  const bookmarkToggle = useToggleResultBookmark()

  const defaultClient = clientsStatus?.find((c) => c.is_default && c.status === 'online') ?? null

  const handleRefresh = useCallback(() => {
    if (selectedFeedId === null) return
    refreshFeed.mutate(selectedFeedId)
  }, [selectedFeedId, refreshFeed])

  const handleSortClick = useCallback(
    (column: SortableColumn) => {
      if (sortBy === column.key) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortBy(column.key)
        setSortOrder(column.defaultOrder)
      }
    },
    [sortBy],
  )

  const handleSendClick = (result: SearchResult, event: React.MouseEvent) => {
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
        search_query: selectedFeed ? `feed:${selectedFeed.name}` : null,
      })
      return
    }
    setSendResult(result)
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
        ? instancesStatus?.jackett.find((i) => i.name === result.source)
        : instancesStatus?.prowlarr.find((i) => i.name === result.source)

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
      search_query: selectedFeed ? `feed:${selectedFeed.name}` : null,
    })
    window.open(result.torrent_url, '_blank')
  }

  const openCreate = () => {
    setEditingFeed(null)
    setEditorOpen(true)
  }

  const openEdit = (feed: Feed) => {
    setEditingFeed(feed)
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingFeed(null)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteFeed.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      // toast handled by mutation
    }
  }

  const activeFilterCount =
    (freeleechOnly ? 1 : 0) +
    (minSeedersFilter > 0 ? 1 : 0) +
    (maxSizeFilter !== null ? 1 : 0) +
    (seenWithinHours !== null ? 1 : 0) +
    (firstSeenWithinHours !== null ? 1 : 0)

  const isRefreshing = refreshFeed.isPending && refreshFeed.variables === selectedFeedId

  return (
    <div
      className={cn(
        'grid gap-5 transition-[grid-template-columns] duration-200 ease-out',
        sidebarCollapsed ? 'lg:grid-cols-[56px_1fr]' : 'lg:grid-cols-[280px_1fr]',
      )}
    >
      <aside className="space-y-3">
        {sidebarCollapsed ? (
          <CollapsedFeedRail
            feeds={feeds}
            newCounts={newCounts}
            selectedFeedId={selectedFeedId}
            onSelect={setSelectedFeedId}
            onCreate={openCreate}
            onExpand={() => setSidebarCollapsed(false)}
            isLoading={feedsLoading}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
                <Rss className="h-4 w-4 text-cyan-400" />
                Feeds
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={openCreate}
                  className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New
                </button>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="rounded-lg border border-slate-700/60 bg-slate-800/40 p-1 text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-slate-200"
                  title="Collapse sidebar"
                  aria-label="Collapse feeds sidebar"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {feedsLoading ? (
              <div className="flex items-center justify-center rounded-lg border border-slate-800/50 bg-slate-900/40 py-8 text-slate-400">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-xs">Loading feeds…</span>
              </div>
            ) : feedsError ? (
              <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                Failed to load feeds.
              </p>
            ) : feeds.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-900/30 p-4 text-center">
                <Rss className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                <p className="text-xs text-slate-400">No feeds yet.</p>
                <button
                  onClick={openCreate}
                  className="mt-2 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Create your first feed
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {feeds.map((feed) => {
                  const isActive = feed.id === selectedFeedId
                  const indexerCount = feed.indexers.length
                  const newCount = newCounts[feed.id] ?? 0
                  return (
                    <button
                      key={feed.id}
                      onClick={() => setSelectedFeedId(feed.id)}
                      className={cn(
                        'group block w-full rounded-lg border px-3 py-2.5 text-left transition-all',
                        isActive
                          ? 'border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                          : 'border-slate-800/50 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'truncate text-sm font-medium',
                              isActive ? 'text-cyan-100' : 'text-slate-200',
                            )}
                          >
                            {feed.name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <Layers className="h-3 w-3" />
                            {indexerCount} indexer{indexerCount === 1 ? '' : 's'}
                            {feed.filters.freeleech_only && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                                <Sparkles className="h-2.5 w-2.5" />
                                FL
                              </span>
                            )}
                            {!feed.polling_enabled && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-amber-300">
                                <PauseCircle className="h-2.5 w-2.5" />
                                Paused
                              </span>
                            )}
                          </p>
                        </div>
                        {newCount > 0 && (
                          <span
                            className="flex flex-shrink-0 items-center gap-1 rounded-full border border-cyan-400/50 bg-gradient-to-r from-cyan-500/25 to-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.3)]"
                            title={`${newCount.toLocaleString()} new item${newCount === 1 ? '' : 's'} since your last visit`}
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            {newCount > 99 ? '99+' : newCount}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </aside>

      <section className="min-w-0 space-y-4">
        {!selectedFeed ? (
          <EmptyState
            icon={<Rss className="h-12 w-12" />}
            title="No feed selected"
            description="Create a feed to start collecting a polled history of indexer releases."
            action={
              feeds.length === 0 ? { label: 'Create a feed', onClick: openCreate } : undefined
            }
          />
        ) : (
          <>
            <header className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
                    <Rss className="h-4 w-4 text-cyan-400" />
                    {selectedFeed.name}
                  </h2>
                  {selectedFeed.description && (
                    <p className="mt-1 text-xs text-slate-400">{selectedFeed.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {filterChips(selectedFeed).map((chip) => (
                      <span
                        key={chip.label}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                          chip.tone === 'highlight'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-slate-700/50 bg-slate-800/40 text-slate-300',
                        )}
                      >
                        {chip.tone === 'highlight' && <Sparkles className="h-2.5 w-2.5" />}
                        {chip.label}
                      </span>
                    ))}
                    {filterChips(selectedFeed).length === 0 && (
                      <span className="text-[11px] italic text-slate-500">
                        No filters — every result passes through.
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {selectedFeed.indexers.slice(0, 6).map((idx) => (
                      <span
                        key={`${idx.source_type}-${idx.source_instance_id}-${idx.indexer_id}`}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                          idx.source_type === 'jackett'
                            ? 'border-amber-500/20 bg-amber-500/5 text-amber-200'
                            : 'border-cyan-500/20 bg-cyan-500/5 text-cyan-200',
                        )}
                      >
                        {idx.source_type === 'jackett' ? (
                          <Zap className="h-2.5 w-2.5" />
                        ) : (
                          <Database className="h-2.5 w-2.5" />
                        )}
                        {idx.indexer_name}
                      </span>
                    ))}
                    {selectedFeed.indexers.length > 6 && (
                      <span className="rounded-md border border-slate-700/50 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                        +{selectedFeed.indexers.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Refresh this feed now"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                    Refresh now
                  </button>
                  <button
                    onClick={() => openEdit(selectedFeed)}
                    className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-2 text-slate-300 transition-colors hover:bg-slate-800/70"
                    title="Edit feed"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(selectedFeed)}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 transition-colors hover:bg-rose-500/20"
                    title="Delete feed"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Polling status panel */}
              <div
                className={cn(
                  'mt-3 grid gap-3 rounded-lg border bg-slate-950/40 p-3 text-[11px] sm:grid-cols-[auto_1fr_auto]',
                  pollingEnabled ? 'border-slate-800/60' : 'border-amber-500/30 bg-amber-500/5',
                )}
              >
                <div className="flex items-center gap-2">
                  {pollingEnabled ? (
                    <Radar
                      className={cn('h-4 w-4 text-cyan-400', isRefreshing && 'animate-pulse')}
                    />
                  ) : (
                    <PauseCircle className="h-4 w-4 text-amber-400" />
                  )}
                  <span
                    className={cn(
                      'font-semibold uppercase tracking-wider',
                      pollingEnabled ? 'text-cyan-300' : 'text-amber-300',
                    )}
                  >
                    {pollingEnabled
                      ? `Polling every ${selectedFeed.poll_interval_minutes}m`
                      : 'Polling paused'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 sm:justify-self-center">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lastPolledAt ? `Last poll ${formatRelative(lastPolledAt)}` : 'Not yet polled'}
                  </span>
                  {pollingEnabled && nextPollAt && (
                    <span className="flex items-center gap-1">
                      <ArrowDown className="h-3 w-3" />
                      Next {nextPollLabel(nextPollAt, pollingEnabled)}
                    </span>
                  )}
                </div>
                <div className="text-slate-300 sm:justify-self-end">
                  <span className="font-medium text-slate-200">
                    {totalInHistory.toLocaleString()}
                  </span>{' '}
                  <span className="text-slate-500">
                    item{totalInHistory === 1 ? '' : 's'} in history
                  </span>
                </div>
              </div>
            </header>

            <IndexerErrorBanner
              errors={sourceErrors}
              title="The last poll hit errors on these indexers — items from them may be missing or stale:"
            />

            {/* Filters bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/50 bg-slate-900/40 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {canFilterNew && (
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 transition-colors',
                      showNewOnly
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-transparent text-slate-300 hover:text-cyan-200',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={showNewOnly}
                      onChange={(e) => setShowNewOnly(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-cyan-500"
                    />
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-cyan-400" />
                      New only
                    </span>
                  </label>
                )}
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5',
                    newOnlyActive ? 'text-slate-500' : 'text-slate-300',
                  )}
                  title={
                    newOnlyActive
                      ? "Disabled while 'New only' is active — every NEW item is shown regardless of staleness."
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={!hideStale}
                    onChange={(e) => setHideStale(!e.target.checked)}
                    disabled={newOnlyActive}
                    className="h-3.5 w-3.5 cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
                  />
                  <span>Show stale items</span>
                </label>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5',
                    newOnlyActive ? 'text-slate-500' : 'text-slate-300',
                  )}
                  title={
                    newOnlyActive
                      ? "Disabled while 'New only' is active — every NEW item is shown regardless of seeders."
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={hideDead}
                    onChange={(e) => setHideDead(e.target.checked)}
                    disabled={newOnlyActive}
                    className="h-3.5 w-3.5 cursor-pointer accent-rose-500 disabled:cursor-not-allowed"
                  />
                  <span>Hide dead items</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                  <input
                    type="checkbox"
                    checked={freeleechOnly}
                    onChange={(e) => setFreeleechOnly(e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-emerald-500"
                  />
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-emerald-400" />
                    Freeleech only
                  </span>
                </label>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => {
                      setFreeleechOnly(false)
                      setMinSeedersFilter(0)
                      setMaxSizeFilter(null)
                      setSeenWithinHours(null)
                      setFirstSeenWithinHours(null)
                    }}
                    className="text-[11px] font-medium text-cyan-400 hover:underline"
                  >
                    Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {itemsQuery.isLoading
                  ? 'Loading…'
                  : `${total.toLocaleString()} item${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''}`}
              </p>
            </div>

            {itemsQuery.isLoading && entries.length === 0 ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-800/50 bg-slate-900/50 py-16">
                <LoadingSpinner size="md" />
                <span className="ml-3 text-sm text-slate-400">Loading feed history…</span>
              </div>
            ) : itemsQuery.isError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-400" />
                <p className="text-sm text-rose-200">Failed to load this feed.</p>
                <button
                  onClick={() => itemsQuery.refetch()}
                  className="mt-3 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : showNewOnly && entries.length === 0 ? (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
                <Sparkles className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-slate-400">You're all caught up</p>
                <p className="mt-1 text-sm text-slate-500">No new items since your last visit.</p>
                <button
                  onClick={() => setShowNewOnly(false)}
                  className="mt-3 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Show all items
                </button>
              </div>
            ) : entries.length === 0 && total === 0 ? (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
                <Radar className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-slate-400">No items yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  {pollingEnabled
                    ? `History fills up automatically. The next poll is ${nextPollLabel(nextPollAt, pollingEnabled) ?? 'on its way'}.`
                    : 'Polling is paused. Enable it or hit Refresh now to collect items.'}
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                  Refresh now
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
                <FilterIcon className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-slate-400">No items match these filters</p>
                <p className="mt-1 text-sm text-slate-500">
                  History has {total.toLocaleString()} item{total === 1 ? '' : 's'}, but none pass
                  the current filter selection.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/50">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-800/50">
                          <SortableTh
                            column={titleColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                          />
                          <SortableTh
                            column={sizeColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                            filter={{
                              label: 'Filter by max size',
                              isActive: maxSizeFilter !== null,
                              onClear: () => setMaxSizeFilter(null),
                              panel: (close) => (
                                <MaxSizeFilterPanel
                                  current={maxSizeFilter}
                                  onSubmit={(bytes) => {
                                    setMaxSizeFilter(bytes)
                                    close()
                                  }}
                                />
                              ),
                            }}
                          />
                          <SortableTh
                            column={seedersColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                            filter={{
                              label: 'Filter by minimum seeders',
                              isActive: minSeedersFilter > 0,
                              onClear: () => setMinSeedersFilter(0),
                              panel: (close) => (
                                <MinSeedersFilterPanel
                                  current={minSeedersFilter}
                                  onSubmit={(n) => {
                                    setMinSeedersFilter(n)
                                    close()
                                  }}
                                />
                              ),
                            }}
                          />
                          <SortableTh
                            column={pubDateColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                          />
                          <SortableTh
                            column={lastSeenColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                            filter={{
                              label: 'Seen within last hours',
                              isActive: seenWithinHours !== null,
                              onClear: () => setSeenWithinHours(null),
                              panel: (close) => (
                                <HoursFilterPanel
                                  current={seenWithinHours}
                                  hint="Hides items last seen earlier than this."
                                  onSubmit={(hours) => {
                                    setSeenWithinHours(hours)
                                    close()
                                  }}
                                />
                              ),
                            }}
                          />
                          <SortableTh
                            column={firstSeenColumn}
                            activeSortBy={sortBy}
                            activeSortOrder={sortOrder}
                            onClick={handleSortClick}
                            filter={{
                              label: 'First seen within last hours',
                              isActive: firstSeenWithinHours !== null,
                              onClear: () => setFirstSeenWithinHours(null),
                              panel: (close) => (
                                <HoursFilterPanel
                                  current={firstSeenWithinHours}
                                  hint="Only shows items first added within this window."
                                  onSubmit={(hours) => {
                                    setFirstSeenWithinHours(hours)
                                    close()
                                  }}
                                />
                              ),
                            }}
                          />
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {entries.map((result, idx) => {
                          const isDead = result.seeders === 0
                          const isBookmarked = bookmarkIdByResultId[result.id] !== undefined
                          const stale = isStale(result, staleAfterSeconds)
                          const isNew =
                            lastViewedBaseline !== null &&
                            lastViewedBaseline > 0 &&
                            new Date(result.first_seen_at).getTime() > lastViewedBaseline
                          return (
                            <tr
                              key={result.dedup_key}
                              className={cn(
                                'group animate-fade-in transition-all hover:bg-slate-800/30',
                                stale && 'opacity-60 hover:opacity-100',
                                isDead && !stale && 'opacity-60 hover:opacity-100',
                              )}
                              style={{ animationDelay: `${Math.min(idx * 20, 600)}ms` }}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() =>
                                      bookmarkToggle.toggle({
                                        result,
                                        isCurrentlyBookmarked: isBookmarked,
                                        bookmarkId: bookmarkIdByResultId[result.id],
                                      })
                                    }
                                    disabled={bookmarkToggle.isPending}
                                    title={
                                      isBookmarked ? 'Remove bookmark' : 'Bookmark this result'
                                    }
                                    className={cn(
                                      'mt-0.5 rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                      isBookmarked
                                        ? 'text-amber-400 hover:text-amber-300'
                                        : 'text-slate-600 hover:text-slate-400',
                                    )}
                                  >
                                    <Bookmark
                                      className={cn('h-4 w-4', isBookmarked && 'fill-current')}
                                    />
                                  </button>
                                  <span
                                    className={cn(
                                      'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                                      freshnessTone(result, staleAfterSeconds),
                                    )}
                                    title={`Seen ${formatRelative(result.last_seen_at)} • First seen ${formatRelative(result.first_seen_at)}`}
                                  />
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
                                      {isNew && (
                                        <span
                                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-cyan-400/50 bg-gradient-to-r from-cyan-500/25 to-blue-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
                                          title={`First added ${formatRelative(result.first_seen_at)} — appeared since your last visit`}
                                        >
                                          <Sparkles className="h-3 w-3" />
                                          New
                                        </span>
                                      )}
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
                                      {stale && (
                                        <span
                                          className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-slate-700/40 bg-slate-800/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400"
                                          title={`Last observed ${formatRelative(result.last_seen_at)} — freeleech / seeders may be stale`}
                                        >
                                          <Clock className="h-3 w-3" />
                                          Stale
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span
                                        className={cn(
                                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                          result.source_type === 'jackett'
                                            ? 'border border-amber-500/20 bg-amber-500/10 text-amber-300'
                                            : 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
                                        )}
                                        title={`${result.source} (${result.source_type})`}
                                      >
                                        {result.source_type === 'jackett' ? (
                                          <Zap className="h-2.5 w-2.5" />
                                        ) : (
                                          <Database className="h-2.5 w-2.5" />
                                        )}
                                        {result.source}
                                      </span>
                                      <span className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                                        {result.category || '—'}
                                      </span>
                                      <span className="text-[10px] text-slate-500">
                                        {result.indexer}
                                      </span>
                                    </div>
                                  </div>
                                </div>
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
                                <div
                                  className="flex items-center gap-1.5"
                                  title={
                                    result.date
                                      ? `Indexer reported: ${formatDateTime(result.date)}`
                                      : 'No date reported'
                                  }
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatAge(result.date)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-400">
                                <div
                                  className="flex items-center gap-1.5"
                                  title={`Last seen: ${formatDateTime(result.last_seen_at)}`}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  {formatAge(result.last_seen_at)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-400">
                                <div
                                  className="flex items-center gap-1.5"
                                  title={`First seen: ${formatDateTime(result.first_seen_at)}`}
                                >
                                  <Activity className="h-3.5 w-3.5" />
                                  {formatAge(result.first_seen_at)}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => copyMagnet(result)}
                                    disabled={!result.magnet_link}
                                    className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Copy magnet"
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

                <PaginationFooter
                  total={total}
                  offset={offset}
                  pageSize={pageSize}
                  shownCount={entries.length}
                  onOffsetChange={setOffset}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </>
        )}
      </section>

      <FeedEditorModal isOpen={editorOpen} onClose={closeEditor} feed={editingFeed} />
      <SendToClientModal
        isOpen={!!sendResult}
        onClose={() => setSendResult(null)}
        result={sendResult}
        searchQuery={selectedFeed ? `feed:${selectedFeed.name}` : ''}
      />
      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete feed?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed along with its polled history. The indexers themselves are not affected.`
            : ''
        }
        confirmLabel="Delete feed"
        isLoading={deleteFeed.isPending}
      />
    </div>
  )
}

interface SortableThProps {
  column: SortableColumn
  activeSortBy: SortableColumnKey
  activeSortOrder: SortOrder
  onClick: (column: SortableColumn) => void
  filter?: {
    isActive: boolean
    label: string
    panel: (close: () => void) => ReactNode
    onClear: () => void
  }
}

interface CollapsedFeedRailProps {
  feeds: Feed[]
  newCounts: Record<number, number>
  selectedFeedId: number | null
  onSelect: (id: number) => void
  onCreate: () => void
  onExpand: () => void
  isLoading: boolean
}

function feedInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '·'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function CollapsedFeedRail({
  feeds,
  newCounts,
  selectedFeedId,
  onSelect,
  onCreate,
  onExpand,
  isLoading,
}: CollapsedFeedRailProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onExpand}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/60 bg-slate-800/40 text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-cyan-300"
        title="Expand feeds"
        aria-label="Expand feeds sidebar"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        onClick={onCreate}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 transition-colors hover:bg-cyan-500/20"
        title="New feed"
        aria-label="Create a new feed"
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="my-1 h-px w-6 bg-slate-800/80" />
      {isLoading ? (
        <LoadingSpinner size="sm" />
      ) : (
        feeds.map((feed) => {
          const isActive = feed.id === selectedFeedId
          const newCount = newCounts[feed.id] ?? 0
          return (
            <button
              key={feed.id}
              onClick={() => onSelect(feed.id)}
              title={newCount > 0 ? `${feed.name} — ${newCount.toLocaleString()} new` : feed.name}
              aria-label={newCount > 0 ? `${feed.name}, ${newCount} new items` : feed.name}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-semibold transition-all',
                isActive
                  ? 'border-cyan-500/50 bg-gradient-to-br from-cyan-500/20 to-blue-500/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                  : 'border-slate-800/60 bg-slate-900/50 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60',
              )}
            >
              {feedInitials(feed.name)}
              {newCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-slate-950 bg-gradient-to-r from-cyan-400 to-blue-500 px-1 text-[9px] font-bold leading-none text-slate-950 shadow-[0_0_6px_rgba(34,211,238,0.6)]">
                  {newCount > 99 ? '99+' : newCount}
                </span>
              ) : (
                feed.filters.freeleech_only && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-slate-950 bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
                    aria-hidden
                  />
                )
              )}
              {!feed.polling_enabled && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-950 bg-amber-400"
                  aria-hidden
                />
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

interface PaginationFooterProps {
  total: number
  offset: number
  pageSize: number
  shownCount: number
  onOffsetChange: (next: number) => void
  onPageSizeChange: (next: number) => void
}

/**
 * Compact pages list with a sliding window of numbered buttons around the
 * current page and ``…`` collapses for big totals. The window stays a
 * constant width so layout doesn't shift as the user pages through.
 */
function pageWindow(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages: (number | 'ellipsis')[] = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  if (start > 2) pages.push('ellipsis')
  for (let p = start; p <= end; p++) pages.push(p)
  if (end < totalPages - 1) pages.push('ellipsis')
  pages.push(totalPages)
  return pages
}

function PaginationFooter({
  total,
  offset,
  pageSize,
  shownCount,
  onOffsetChange,
  onPageSizeChange,
}: PaginationFooterProps) {
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(totalPages, Math.floor(offset / pageSize) + 1)
  const onFirst = currentPage === 1
  const onLast = currentPage === totalPages
  const goToPage = (page: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page))
    onOffsetChange((clamped - 1) * pageSize)
  }
  const pages = pageWindow(currentPage, totalPages)
  const rangeStart = offset + 1
  const rangeEnd = offset + shownCount

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/50 bg-slate-900/40 px-3 py-2 text-[11px] text-slate-400">
      <div className="flex items-center gap-2">
        <span>
          Showing{' '}
          <span className="font-medium text-slate-200">
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
          </span>{' '}
          of <span className="font-medium text-slate-200">{total.toLocaleString()}</span>
        </span>
        <span className="hidden text-slate-700 sm:inline">•</span>
        <label className="hidden items-center gap-1.5 sm:flex">
          <span className="text-slate-500">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="cursor-pointer rounded border border-slate-700/60 bg-slate-800/50 px-1.5 py-0.5 text-[11px] text-slate-200 focus:border-cyan-500/50 focus:outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination" role="navigation">
          <button
            onClick={() => goToPage(1)}
            disabled={onFirst}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-300 transition-colors hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-30"
            title="First page"
            aria-label="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={onFirst}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-300 transition-colors hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="mx-0.5 flex items-center gap-1">
            {pages.map((p, idx) =>
              p === 'ellipsis' ? (
                <span
                  key={`e-${idx}`}
                  className="inline-flex h-7 w-7 items-center justify-center text-slate-600"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => goToPage(p)}
                  aria-current={p === currentPage ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border px-1.5 text-[11px] font-medium transition-colors',
                    p === currentPage
                      ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                      : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70',
                  )}
                >
                  {p}
                </button>
              ),
            )}
          </div>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={onLast}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-300 transition-colors hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-30"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={onLast}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-700/60 bg-slate-800/40 text-slate-300 transition-colors hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-30"
            title="Last page"
            aria-label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      )}
    </div>
  )
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

interface MinSeedersFilterPanelProps {
  current: number
  onSubmit: (n: number) => void
}

function MinSeedersFilterPanel({ current, onSubmit }: MinSeedersFilterPanelProps) {
  const [value, setValue] = useState(String(current || ''))
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Min seeders
      </label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(Number(value) || 0)
        }}
        placeholder="0"
        className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
        autoFocus
      />
      <button
        onClick={() => onSubmit(Number(value) || 0)}
        className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
      >
        Apply
      </button>
    </div>
  )
}

interface MaxSizeFilterPanelProps {
  current: number | null
  onSubmit: (bytes: number | null) => void
}

function MaxSizeFilterPanel({ current, onSubmit }: MaxSizeFilterPanelProps) {
  const initial = current !== null ? formatBytes(current).replace(/\s+/g, '') : ''
  const [value, setValue] = useState(initial)
  const trimmed = value.trim()
  const parsed = trimmed ? parseSize(trimmed) : null
  const invalid = !!trimmed && parsed === null

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Max size
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !invalid) onSubmit(parsed)
        }}
        placeholder="e.g. 10GB"
        className={cn(
          'w-full rounded-md border bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none',
          invalid ? 'border-rose-500/60' : 'border-slate-700 focus:border-cyan-500/50',
        )}
        autoFocus
      />
      <p className={cn('mt-1.5 text-[10px]', invalid ? 'text-rose-300' : 'text-slate-500')}>
        {invalid ? 'Use a unit like KB, MB, GB, TB.' : 'Hides items larger than this.'}
      </p>
      <button
        disabled={invalid}
        onClick={() => onSubmit(parsed)}
        className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-40"
      >
        Apply
      </button>
    </div>
  )
}

interface HoursFilterPanelProps {
  current: number | null
  hint: string
  onSubmit: (hours: number | null) => void
}

function HoursFilterPanel({ current, hint, onSubmit }: HoursFilterPanelProps) {
  const [value, setValue] = useState(current !== null ? String(current) : '')
  const presets: { label: string; hours: number }[] = [
    { label: '1h', hours: 1 },
    { label: '6h', hours: 6 },
    { label: '24h', hours: 24 },
    { label: '7d', hours: 168 },
  ]
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
        Within last (hours)
      </label>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = Number(value)
            onSubmit(Number.isFinite(n) && n > 0 ? n : null)
          }
        }}
        placeholder="e.g. 24"
        className="w-full rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
        autoFocus
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setValue(String(p.hours))
              onSubmit(p.hours)
            }}
            className="rounded border border-slate-700/60 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-slate-800/70"
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">{hint}</p>
      <button
        onClick={() => {
          const n = Number(value)
          onSubmit(Number.isFinite(n) && n > 0 ? n : null)
        }}
        className="mt-2 inline-flex w-full items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
      >
        Apply
      </button>
    </div>
  )
}
