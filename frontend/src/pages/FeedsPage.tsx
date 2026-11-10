import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileDown,
  Filter as FilterIcon,
  Magnet,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Rss,
  Trash2,
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
  getFeedVisit,
  beginFeedVisit,
  touchFeedSeen,
  type FeedVisit,
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
  align: 'right',
  defaultOrder: 'desc',
}
const seedersColumn: SortableColumn = {
  key: 'seeders',
  label: 'S/L',
  align: 'right',
  defaultOrder: 'desc',
}
const pubDateColumn: SortableColumn = {
  key: 'pub_date',
  label: 'Age',
  align: 'right',
  defaultOrder: 'desc',
}
const lastSeenColumn: SortableColumn = {
  key: 'last_seen',
  label: 'Seen',
  align: 'right',
  defaultOrder: 'desc',
}
const firstSeenColumn: SortableColumn = {
  key: 'first_seen',
  label: 'Added',
  align: 'right',
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
 * Opens a visit for the given feed and returns it once the server has
 * answered. The visit carries the "new since" baseline — the server's
 * ``seen_through`` marker as it stood before this open advanced it — plus the
 * cutoffs of earlier visits. Items whose ``first_seen_at`` is newer than the
 * baseline are flagged NEW.
 *
 * The visit is established once per feed per page session, so flagged rows
 * stay flagged while the feed is being viewed and when switching back to it.
 * ``failed`` is set when the server couldn't be reached; the caller falls back
 * to the marker from the feed list. See {@link beginFeedVisit}.
 */
function useFeedVisit(feedId: number | null): { visit: FeedVisit | null; failed: boolean } {
  const [result, setResult] = useState<{ feedId: number; visit: FeedVisit | null } | null>(null)

  useEffect(() => {
    if (feedId === null) return
    let cancelled = false
    beginFeedVisit(feedId).then(
      (visit) => {
        if (!cancelled) setResult({ feedId, visit })
      },
      () => {
        if (!cancelled) setResult({ feedId, visit: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [feedId])

  if (feedId === null) return { visit: null, failed: false }
  // A feed already opened this session resolves synchronously, so switching
  // back to it doesn't flash a loading state.
  const known = getFeedVisit(feedId)
  if (known) return { visit: known, failed: false }
  if (result && result.feedId === feedId) {
    return { visit: result.visit, failed: result.visit === null }
  }
  return { visit: null, failed: false }
}

function formatCutoff(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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

  const { visit: openedVisit, failed: visitFailed } = useFeedVisit(selectedFeedId)
  // If the server couldn't be told about this visit, judge NEW against the
  // marker the feed list already carries rather than blocking the page.
  const visit: FeedVisit | null = useMemo(() => {
    if (openedVisit) return openedVisit
    if (!visitFailed) return null
    const seenThrough = selectedFeed?.seen_through
      ? new Date(selectedFeed.seen_through).getTime()
      : 0
    return { baseline: Number.isFinite(seenThrough) ? seenThrough : 0, history: [] }
  }, [openedVisit, visitFailed, selectedFeed?.seen_through])
  // Items aren't requested until the baseline is known — otherwise the first
  // fetch would go out unfiltered and then immediately be replaced.
  const visitReady = visit !== null
  // "New" is meaningful only once a prior visit has been recorded; until then
  // there's nothing to compare against, so the "new only" filter is hidden.
  const canFilterNew = visit !== null && visit.baseline > 0
  // Cutoffs of earlier visits. Picking one widens the NEW window back to that
  // visit, re-showing items that were already marked seen (e.g. a batch lost
  // to an accidental page reload).
  const olderCutoffs = useMemo(() => visit?.history ?? [], [visit])
  // Keyed by feed so a pick never leaks into the next feed's first request.
  const [sinceChoice, setSinceChoice] = useState<{ feedId: number; since: number } | null>(null)
  const sinceOverride =
    sinceChoice !== null &&
    sinceChoice.feedId === selectedFeedId &&
    olderCutoffs.includes(sinceChoice.since)
      ? sinceChoice.since
      : null
  const newBaseline = sinceOverride ?? visit?.baseline ?? null
  const chooseSince = useCallback(
    (since: number | null) => {
      if (selectedFeedId === null) return
      setSinceChoice(since === null ? null : { feedId: selectedFeedId, since })
      if (since !== null) setShowNewOnly(true)
    },
    [selectedFeedId],
  )

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
    sinceOverride,
    pageSize,
  ])

  // "New only" takes precedence over the implicit staleness window so every
  // row the table flags NEW — and that the sidebar badge counts — is visible.
  // Explicit per-column filters (a user-set min_seeders, or a chosen "seen
  // within" window) still apply on top so manual narrowing is never suppressed.
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
    if (minSeedersFilter > 0) return minSeedersFilter
    return hideDead ? 1 : 0
  }, [minSeedersFilter, hideDead])

  // When the "new only" filter is active, ask the server for items first seen
  // after the visit baseline — matching the rows the table flags NEW.
  const newOnlyCutoff = useMemo(() => {
    if (!newOnlyActive) return undefined
    return new Date(newBaseline as number).toISOString()
  }, [newOnlyActive, newBaseline])

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

  const itemsQuery = useFeedItems(selectedFeedId, itemsParams, visitReady)
  const itemsLoading = itemsQuery.isLoading || (selectedFeedId !== null && !visitReady)

  // Stable key identifying the current view (feed + filters + sort + page).
  // Used to recognise when the user has explicitly navigated to a new view
  // (sync immediately, no banner) vs. when a background poll has merely
  // produced fresh data for the current view (freeze + offer the banner).
  const viewKey = useMemo(
    () => JSON.stringify({ feedId: selectedFeedId, ...itemsParams }),
    [selectedFeedId, itemsParams],
  )

  // Snapshot of the rows actually rendered in the table. Held in local state
  // so background refetches don't reorder rows under the user's cursor. The
  // "Load new items" banner surfaces incoming changes and swaps them in only
  // when the user opts in.
  const [displayed, setDisplayed] = useState<{
    entries: FeedItem[]
    total: number
    key: string
  } | null>(null)

  // Set when the user explicitly clicks "Refresh now" so the next data update
  // is accepted without forcing them through the banner.
  const refreshAcceptRef = useRef(false)

  const incomingEntries = useMemo(() => itemsQuery.data?.entries ?? [], [itemsQuery.data])
  const incomingTotal = itemsQuery.data?.total ?? 0
  const hasIncoming = itemsQuery.data !== undefined
  const isPlaceholderData = itemsQuery.isPlaceholderData

  useEffect(() => {
    if (!hasIncoming) return
    if (isPlaceholderData) return
    if (!displayed || displayed.key !== viewKey) {
      setDisplayed({ entries: incomingEntries, total: incomingTotal, key: viewKey })
      return
    }
    if (refreshAcceptRef.current) {
      refreshAcceptRef.current = false
      setDisplayed({ entries: incomingEntries, total: incomingTotal, key: viewKey })
    }
  }, [hasIncoming, isPlaceholderData, viewKey, incomingEntries, incomingTotal, displayed])

  // Diff against the frozen snapshot. Returns null when there's nothing to
  // surface — identical contents, or the incoming data belongs to a different
  // view (mid-transition placeholder).
  const pendingChange = useMemo(() => {
    if (!hasIncoming || isPlaceholderData) return null
    if (!displayed || displayed.key !== viewKey) return null
    const displayedKeys = new Set(displayed.entries.map((e) => e.dedup_key))
    const incomingKeys = new Set(incomingEntries.map((e) => e.dedup_key))
    let added = 0
    let removed = 0
    incomingEntries.forEach((e) => {
      if (!displayedKeys.has(e.dedup_key)) added++
    })
    displayed.entries.forEach((e) => {
      if (!incomingKeys.has(e.dedup_key)) removed++
    })
    if (added === 0 && removed === 0 && displayed.total === incomingTotal) {
      return null
    }
    return { added, removed, totalDelta: incomingTotal - displayed.total }
  }, [hasIncoming, isPlaceholderData, displayed, viewKey, incomingEntries, incomingTotal])

  const acceptPending = useCallback(() => {
    if (!itemsQuery.data) return
    setDisplayed({
      entries: itemsQuery.data.entries,
      total: itemsQuery.data.total,
      key: viewKey,
    })
  }, [itemsQuery.data, viewKey])

  const entries = displayed?.entries ?? []
  const total = displayed?.total ?? 0

  // Each successful items fetch is the user "seeing" the current contents of
  // the feed; advance the server's seen marker so the next visit's NEW
  // baseline excludes items the user already saw via background polls. The
  // in-session NEW flags don't move, since they read the visit's baseline.
  const itemsUpdatedAt = itemsQuery.dataUpdatedAt
  useEffect(() => {
    if (selectedFeedId === null) return
    if (!itemsUpdatedAt) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    touchFeedSeen(selectedFeedId)
  }, [selectedFeedId, itemsUpdatedAt])

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
    refreshAcceptRef.current = true
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
        'grid gap-6',
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
            <div className="flex h-8 items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-100">Feeds</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={openCreate}
                  className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  New
                </button>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                  title="Collapse sidebar"
                  aria-label="Collapse feeds sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            {feedsLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 py-8 text-slate-400">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-xs">Loading feeds…</span>
              </div>
            ) : feedsError ? (
              <p className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300">
                Failed to load feeds
              </p>
            ) : feeds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center">
                <p className="text-xs text-slate-400">No feeds yet</p>
                <button
                  onClick={openCreate}
                  className="mt-2 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Create your first feed
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                {feeds.map((feed) => {
                  const isActive = feed.id === selectedFeedId
                  const indexerCount = feed.indexers.length
                  const newCount = newCounts[feed.id] ?? 0
                  return (
                    <button
                      key={feed.id}
                      onClick={() => setSelectedFeedId(feed.id)}
                      className={cn(
                        'flex h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left transition-colors',
                        isActive
                          ? 'bg-slate-800 text-slate-100'
                          : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{feed.name}</span>
                        <span className="block truncate font-mono text-2xs text-slate-500">
                          {indexerCount} indexer{indexerCount === 1 ? '' : 's'}
                          {feed.filters.freeleech_only && (
                            <span className="text-emerald-400"> · freeleech</span>
                          )}
                          {!feed.polling_enabled && (
                            <span className="text-amber-400"> · paused</span>
                          )}
                        </span>
                      </span>
                      {newCount > 0 && (
                        <span
                          className="flex-shrink-0 font-mono text-xs text-cyan-400"
                          title={`${newCount.toLocaleString()} new item${newCount === 1 ? '' : 's'} since your last visit`}
                        >
                          {newCount > 99 ? '99+' : newCount}
                        </span>
                      )}
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
            icon={<Rss className="h-8 w-8" />}
            title="No feed selected"
            description="Create a feed to start collecting a polled history of indexer releases"
            action={
              feeds.length === 0 ? { label: 'Create a feed', onClick: openCreate } : undefined
            }
          />
        ) : (
          <>
            <header className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium text-slate-100">{selectedFeed.name}</h2>
                  {selectedFeed.description && (
                    <p className="mt-1 text-sm text-slate-400">{selectedFeed.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    {filterChips(selectedFeed).map((chip) => (
                      <span
                        key={chip.label}
                        className={cn('tag', chip.tone === 'highlight' && 'tag-good')}
                      >
                        {chip.label}
                      </span>
                    ))}
                    {filterChips(selectedFeed).length === 0 && (
                      <span className="text-xs text-slate-500">
                        No filters — every result passes through
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {selectedFeed.indexers.slice(0, 6).map((idx) => (
                      <span
                        key={`${idx.source_type}-${idx.source_instance_id}-${idx.indexer_id}`}
                        className="tag"
                        title={idx.source_type === 'jackett' ? 'Jackett' : 'Prowlarr'}
                      >
                        {idx.indexer_name}
                      </span>
                    ))}
                    {selectedFeed.indexers.length > 6 && (
                      <span className="tag">+{selectedFeed.indexers.length - 6} more</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="btn-primary mr-1 flex h-8 items-center gap-2 px-3 text-xs"
                    title="Refresh this feed now"
                  >
                    <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                    Refresh now
                  </button>
                  <button
                    onClick={() => openEdit(selectedFeed)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                    title="Edit feed"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPendingDelete(selectedFeed)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete feed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Polling status line */}
              <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-800 pt-3 font-mono text-2xs text-slate-400">
                <span className={pollingEnabled ? 'text-slate-200' : 'text-amber-300'}>
                  {pollingEnabled
                    ? `Polling every ${selectedFeed.poll_interval_minutes}m`
                    : 'Polling paused'}
                </span>
                <span className="text-slate-600">·</span>
                <span>
                  {lastPolledAt ? `last poll ${formatRelative(lastPolledAt)}` : 'not yet polled'}
                </span>
                {pollingEnabled && nextPollAt && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span>next {nextPollLabel(nextPollAt, pollingEnabled)}</span>
                  </>
                )}
                <span className="ml-auto">
                  <span className="text-slate-200">{totalInHistory.toLocaleString()}</span> item
                  {totalInHistory === 1 ? '' : 's'} in history
                </span>
              </p>
            </header>

            {pendingChange && <NewItemsBanner change={pendingChange} onLoad={acceptPending} />}

            <IndexerErrorBanner
              errors={sourceErrors}
              title="The last poll hit errors on these indexers — items from them may be missing or stale:"
            />

            {/* Filters bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                {canFilterNew && (
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2 transition-colors',
                      showNewOnly ? 'text-slate-100' : 'text-slate-300 hover:text-slate-100',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={showNewOnly}
                      onChange={(e) => setShowNewOnly(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-cyan-500"
                    />
                    <span>New only</span>
                  </label>
                )}
                {canFilterNew && olderCutoffs.length > 0 && (
                  <select
                    value={sinceOverride ?? ''}
                    onChange={(e) => chooseSince(e.target.value ? Number(e.target.value) : null)}
                    aria-label="Which visit items count as new since"
                    title="Bring back items that were new on an earlier visit — useful if the page reloaded before you finished reviewing them."
                    className={cn(
                      'h-6 cursor-pointer rounded-lg border bg-slate-800 px-2 text-2xs text-slate-200 focus:border-cyan-500 focus:outline-none',
                      sinceOverride !== null ? 'border-cyan-500/50' : 'border-slate-700',
                    )}
                  >
                    <option value="">Since last visit</option>
                    {olderCutoffs.map((since, idx) => (
                      <option key={since} value={since}>
                        {idx === 0 ? 'Include previous visit' : 'Include earlier visits'} (since{' '}
                        {formatCutoff(since)})
                      </option>
                    ))}
                  </select>
                )}
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2',
                    newOnlyActive ? 'text-slate-500' : 'text-slate-300',
                  )}
                  title={
                    newOnlyActive
                      ? "Disabled while 'New only' is active — every new item is shown regardless of staleness"
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={!hideStale}
                    onChange={(e) => setHideStale(!e.target.checked)}
                    disabled={newOnlyActive}
                    className="h-4 w-4 cursor-pointer accent-cyan-500 disabled:cursor-not-allowed"
                  />
                  <span>Show stale items</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={hideDead}
                    onChange={(e) => setHideDead(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-cyan-500"
                  />
                  <span>Hide dead items</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={freeleechOnly}
                    onChange={(e) => setFreeleechOnly(e.target.checked)}
                    className="h-4 w-4 cursor-pointer accent-cyan-500"
                  />
                  <span>Freeleech only</span>
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
                    className="text-xs font-medium text-cyan-400 hover:underline"
                  >
                    Clear {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              <p className="font-mono text-2xs text-slate-500">
                {itemsLoading
                  ? 'Loading…'
                  : `${total.toLocaleString()} item${total === 1 ? '' : 's'} match${total === 1 ? 'es' : ''}`}
              </p>
            </div>

            {itemsLoading && entries.length === 0 ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 py-16">
                <LoadingSpinner size="md" />
                <span className="ml-3 text-sm text-slate-400">Loading feed history…</span>
              </div>
            ) : itemsQuery.isError ? (
              <div className="rounded-xl border border-red-500/30 bg-slate-900 p-6 text-center">
                <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
                <p className="text-sm text-red-300">Failed to load this feed</p>
                <button
                  onClick={() => itemsQuery.refetch()}
                  className="mt-3 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : showNewOnly && entries.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
                <p className="text-sm text-slate-200">You're all caught up</p>
                <p className="mt-1 text-sm text-slate-500">
                  {sinceOverride !== null
                    ? `No new items since ${formatCutoff(sinceOverride)} match the current filters`
                    : 'No new items since your last visit'}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {sinceOverride === null && olderCutoffs.length > 0 && (
                    <button
                      onClick={() => chooseSince(olderCutoffs[0])}
                      className="text-xs font-medium text-cyan-400 hover:underline"
                      title={`Show items that arrived since ${formatCutoff(olderCutoffs[0])}`}
                    >
                      Show previous visit's new items
                    </button>
                  )}
                  <button
                    onClick={() => setShowNewOnly(false)}
                    className="text-xs font-medium text-cyan-400 hover:underline"
                  >
                    Show all items
                  </button>
                </div>
              </div>
            ) : entries.length === 0 && total === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
                <Radar className="mx-auto mb-4 h-8 w-8 text-slate-600" />
                <p className="text-sm text-slate-200">No items yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  {pollingEnabled
                    ? `History fills up automatically. The next poll is ${nextPollLabel(nextPollAt, pollingEnabled) ?? 'on its way'}.`
                    : 'Polling is paused. Enable it or hit Refresh now to collect items.'}
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-cyan-400 hover:underline disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                  Refresh now
                </button>
              </div>
            ) : entries.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
                <FilterIcon className="mx-auto mb-4 h-8 w-8 text-slate-600" />
                <p className="text-sm text-slate-200">No items match these filters</p>
                <p className="mt-1 text-sm text-slate-500">
                  History has {total.toLocaleString()} item{total === 1 ? '' : 's'}, but none pass
                  the current filter selection
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px]">
                      <thead>
                        <tr className="border-b border-slate-800">
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
                                  hint="Hides items last seen earlier than this"
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
                                  hint="Only shows items first added within this window"
                                  onSubmit={(hours) => {
                                    setFirstSeenWithinHours(hours)
                                    close()
                                  }}
                                />
                              ),
                            }}
                          />
                          <th className="px-4 py-2 text-right text-xs font-normal text-slate-500">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((result) => {
                          const isDead = result.seeders === 0
                          const isBookmarked = bookmarkIdByResultId[result.id] !== undefined
                          const stale = isStale(result, staleAfterSeconds)
                          const isNew =
                            newBaseline !== null &&
                            newBaseline > 0 &&
                            new Date(result.first_seen_at).getTime() > newBaseline
                          return (
                            <tr
                              key={result.dedup_key}
                              className={cn(
                                'group border-t border-slate-800 transition-colors first:border-t-0 hover:bg-slate-800/50',
                                (stale || isDead) && 'opacity-60 hover:opacity-100',
                              )}
                            >
                              <td className="w-full max-w-0 px-4 py-3">
                                <div className="flex items-start gap-2">
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
                                      '-ml-1 flex h-5 w-6 flex-shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                                      isBookmarked
                                        ? 'text-amber-400 hover:text-amber-300'
                                        : 'text-slate-600 hover:text-slate-300',
                                    )}
                                  >
                                    <Bookmark
                                      className={cn('h-4 w-4', isBookmarked && 'fill-current')}
                                    />
                                  </button>
                                  {/* Lamp: lit while the item is unseen since the last visit */}
                                  <span
                                    className={cn(
                                      'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full',
                                      isNew ? 'bg-cyan-400' : 'bg-slate-600',
                                    )}
                                    title={`Seen ${formatRelative(result.last_seen_at)} • First seen ${formatRelative(result.first_seen_at)}`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    {result.info_url ? (
                                      <a
                                        href={result.info_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block truncate text-sm text-slate-100 transition-colors hover:text-cyan-300"
                                        title={result.title}
                                      >
                                        {result.title}
                                      </a>
                                    ) : (
                                      <p
                                        className="truncate text-sm text-slate-100"
                                        title={result.title}
                                      >
                                        {result.title}
                                      </p>
                                    )}
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {isNew && (
                                        <span
                                          className="tag tag-accent"
                                          title={`First added ${formatRelative(result.first_seen_at)} — appeared since ${sinceOverride !== null ? formatCutoff(sinceOverride) : 'your last visit'}`}
                                        >
                                          New
                                        </span>
                                      )}
                                      {matchesByResultId[result.id] && (
                                        <DownloadedBadge match={matchesByResultId[result.id]} />
                                      )}
                                      {isDead && (
                                        <span
                                          className="tag tag-bad"
                                          title="No seeders — this torrent is unlikely to download"
                                        >
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
                                      {stale && (
                                        <span
                                          className="tag"
                                          title={`Last observed ${formatRelative(result.last_seen_at)} — freeleech / seeders may be stale`}
                                        >
                                          Stale
                                        </span>
                                      )}
                                      <span
                                        className="tag"
                                        title={`${result.source} (${result.source_type})`}
                                      >
                                        {result.source}
                                      </span>
                                      {result.category && (
                                        <span className="tag">{result.category}</span>
                                      )}
                                      <span className="ml-1 text-2xs text-slate-500">
                                        {result.indexer}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-300">
                                {result.size_formatted}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-sm">
                                <span className={isDead ? 'text-red-400' : 'text-emerald-400'}>
                                  {result.seeders.toLocaleString()}
                                </span>
                                <span className="text-slate-600"> / </span>
                                <span className="text-red-400">{result.leechers}</span>
                              </td>
                              <td
                                className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-300"
                                title={
                                  result.date
                                    ? `Indexer reported: ${formatDateTime(result.date)}`
                                    : 'No date reported'
                                }
                              >
                                {formatAge(result.date)}
                              </td>
                              <td
                                className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-300"
                                title={`Last seen: ${formatDateTime(result.last_seen_at)}`}
                              >
                                {formatAge(result.last_seen_at)}
                              </td>
                              <td
                                className="whitespace-nowrap px-3 py-3 text-right text-sm text-slate-300"
                                title={`First seen: ${formatDateTime(result.first_seen_at)}`}
                              >
                                {formatAge(result.first_seen_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => copyMagnet(result)}
                                    disabled={!result.magnet_link}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    title="Copy magnet"
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

interface NewItemsBannerProps {
  change: { added: number; removed: number; totalDelta: number }
  onLoad: () => void
}

function NewItemsBanner({ change, onLoad }: NewItemsBannerProps) {
  const { added, removed } = change
  let headline: string
  if (added > 0 && removed > 0) {
    headline = `${added} new • ${removed} dropped`
  } else if (added > 0) {
    headline = `${added.toLocaleString()} new item${added === 1 ? '' : 's'} available`
  } else if (removed > 0) {
    headline = `${removed.toLocaleString()} item${removed === 1 ? '' : 's'} dropped from view`
  } else {
    headline = 'Updates available'
  }
  return (
    <div role="status" aria-live="polite">
      <button
        onClick={onLoad}
        className="group flex w-full items-center justify-between gap-4 rounded-xl border border-cyan-500/40 bg-slate-900 px-4 py-2 text-left text-sm transition-colors hover:border-cyan-500/60"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-cyan-400" />
          <span className="truncate font-mono text-sm text-slate-100">{headline}</span>
          <span className="hidden truncate text-xs text-slate-500 sm:inline">
            A background poll brought updates
          </span>
        </span>
        <span className="btn-secondary flex h-8 flex-shrink-0 items-center gap-2 px-3 text-xs group-hover:bg-slate-700">
          <RefreshCw className="h-4 w-4" />
          Load
        </span>
      </button>
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
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
        title="Expand feeds"
        aria-label="Expand feeds sidebar"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        onClick={onCreate}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-200 transition-colors hover:bg-slate-700"
        title="New feed"
        aria-label="Create a new feed"
      >
        <Plus className="h-4 w-4" />
      </button>
      <div className="my-1 h-px w-6 bg-slate-800" />
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
                'relative flex h-9 w-9 items-center justify-center rounded-lg border bg-slate-800 font-mono text-2xs font-medium transition-colors',
                isActive
                  ? 'border-cyan-500/50 text-slate-100'
                  : 'border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-100',
              )}
            >
              {feedInitials(feed.name)}
              {newCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-cyan-400 px-1 font-mono text-2xs leading-none text-slate-950">
                  {newCount > 99 ? '99+' : newCount}
                </span>
              )}
              {!feed.polling_enabled && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-slate-600"
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
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-400">
      <div className="flex items-center gap-2">
        <span>
          Showing{' '}
          <span className="font-mono text-slate-200">
            {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
          </span>{' '}
          of <span className="font-mono text-slate-200">{total.toLocaleString()}</span>
        </span>
        <span className="hidden text-slate-600 sm:inline">·</span>
        <label className="hidden items-center gap-2 sm:flex">
          <span className="text-slate-500">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-2 font-mono text-2xs text-slate-200 focus:border-cyan-500 focus:outline-none"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="First page"
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={onFirst}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous page"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1">
            {pages.map((p, idx) =>
              p === 'ellipsis' ? (
                <span
                  key={`e-${idx}`}
                  className="inline-flex h-8 w-8 items-center justify-center text-slate-600"
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
                    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-mono text-xs transition-colors',
                    p === currentPage
                      ? 'bg-slate-800 font-medium text-slate-100'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="Next page"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={onLast}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            title="Last page"
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
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
      className={cn('whitespace-nowrap px-3 py-2 text-xs font-normal first:pl-4', textAlign)}
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
      <label className="mb-2 block text-xs text-slate-400">Min seeders</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(Number(value) || 0)
        }}
        placeholder="0"
        className="input h-8 px-2 font-mono text-sm"
        autoFocus
      />
      <button
        onClick={() => onSubmit(Number(value) || 0)}
        className="btn-primary mt-2 flex h-8 w-full items-center justify-center px-3 text-xs"
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
      <label className="mb-2 block text-xs text-slate-400">Max size</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !invalid) onSubmit(parsed)
        }}
        placeholder="10GB"
        className={cn(
          'input h-8 px-2 font-mono text-sm',
          invalid && 'border-red-500/60 focus:border-red-500/60',
        )}
        autoFocus
      />
      <p className={cn('mt-2 text-2xs', invalid ? 'text-red-300' : 'text-slate-500')}>
        {invalid ? 'Use a unit like KB, MB, GB, TB' : 'Hides items larger than this'}
      </p>
      <button
        disabled={invalid}
        onClick={() => onSubmit(parsed)}
        className="btn-primary mt-2 flex h-8 w-full items-center justify-center px-3 text-xs"
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
      <label className="mb-2 block text-xs text-slate-400">Within last (hours)</label>
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
        placeholder="24"
        className="input h-8 px-2 font-mono text-sm"
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
            className="tag transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-2xs text-slate-500">{hint}</p>
      <button
        onClick={() => {
          const n = Number(value)
          onSubmit(Number.isFinite(n) && n > 0 ? n : null)
        }}
        className="btn-primary mt-2 flex h-8 w-full items-center justify-center px-3 text-xs"
      >
        Apply
      </button>
    </div>
  )
}
