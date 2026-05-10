import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bookmark,
  Clock,
  Database,
  Download,
  ExternalLink,
  Filter as FilterIcon,
  FileDown,
  Layers,
  Magnet,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ConfirmDialog,
  DownloadedBadge,
  EmptyState,
  FeedEditorModal,
  LoadingSpinner,
  SendToClientModal,
} from '../components'
import {
  useBookmarkLookup,
  useClientsStatus,
  useDeleteFeed,
  useFeedFetch,
  useFeeds,
  useHistoryLookup,
  useInstancesStatus,
  useLogHistory,
  useSendToClient,
  useToggleResultBookmark,
} from '../hooks'
import { Feed, SearchCategory, SearchResult } from '../types'
import { cn, formatAge, formatBytes, formatDateTime, formatRelative } from '../utils'

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

export function FeedsPage() {
  const { data: feedsData, isLoading: feedsLoading, isError: feedsError } = useFeeds()
  const { data: instancesStatus } = useInstancesStatus()
  const { data: clientsStatus } = useClientsStatus()
  const sendToClient = useSendToClient()
  const logHistory = useLogHistory()
  const deleteFeed = useDeleteFeed()

  const feeds = useMemo(() => feedsData?.entries ?? [], [feedsData])

  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Feed | null>(null)
  const [sendResult, setSendResult] = useState<SearchResult | null>(null)

  // Auto-select first feed when feeds load and none is selected.
  useEffect(() => {
    if (selectedFeedId === null && feeds.length > 0) {
      setSelectedFeedId(feeds[0].id)
    }
    // If the selected feed disappears (e.g., deleted), pick another or clear.
    if (selectedFeedId !== null && !feeds.some((f) => f.id === selectedFeedId)) {
      setSelectedFeedId(feeds.length > 0 ? feeds[0].id : null)
    }
  }, [feeds, selectedFeedId])

  const selectedFeed = useMemo(
    () => feeds.find((f) => f.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId],
  )

  const fetchQuery = useFeedFetch(selectedFeedId)
  const results = fetchQuery.data?.results ?? []
  const fetchedAt = fetchQuery.data?.fetched_at
  const errors = fetchQuery.data?.errors ?? []
  const sourcesQueried = fetchQuery.data?.sources_queried ?? 0

  const { matchesByResultId } = useHistoryLookup(results)
  const { bookmarkIdByResultId } = useBookmarkLookup(results)
  const bookmarkToggle = useToggleResultBookmark()

  const defaultClient = clientsStatus?.find((c) => c.is_default && c.status === 'online') ?? null

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

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-300">
            <Rss className="h-4 w-4 text-cyan-400" />
            Feeds
          </h2>
          <button
            onClick={openCreate}
            className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
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
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </aside>

      <section className="min-w-0 space-y-4">
        {!selectedFeed ? (
          <EmptyState
            icon={<Rss className="h-12 w-12" />}
            title="No feed selected"
            description="Create a feed to monitor latest releases from a chosen set of indexers."
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
                    onClick={() => fetchQuery.refetch()}
                    disabled={fetchQuery.isFetching}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Fetch latest releases now"
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', fetchQuery.isFetching && 'animate-spin')}
                    />
                    Refresh
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
              {fetchedAt && (
                <p className="mt-3 text-[11px] text-slate-500">
                  Fetched {formatRelative(fetchedAt)} from {sourcesQueried} instance
                  {sourcesQueried === 1 ? '' : 's'}.
                </p>
              )}
            </header>

            {errors.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium text-amber-200">
                      {errors.length} source{errors.length === 1 ? '' : 's'} reported errors
                    </p>
                    <ul className="space-y-0.5 text-[11px] text-amber-300/80">
                      {errors.slice(0, 5).map((e, i) => (
                        <li key={i} className="truncate">
                          • {e}
                        </li>
                      ))}
                      {errors.length > 5 && (
                        <li className="italic text-amber-300/60">and {errors.length - 5} more…</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {fetchQuery.isLoading || (fetchQuery.isFetching && results.length === 0) ? (
              <div className="flex items-center justify-center rounded-xl border border-slate-800/50 bg-slate-900/50 py-16">
                <LoadingSpinner size="md" />
                <span className="ml-3 text-sm text-slate-400">Fetching latest releases…</span>
              </div>
            ) : fetchQuery.isError ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-rose-400" />
                <p className="text-sm text-rose-200">Failed to fetch this feed.</p>
                <button
                  onClick={() => fetchQuery.refetch()}
                  className="mt-3 text-xs font-medium text-cyan-400 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/50 p-12 text-center">
                <FilterIcon className="mx-auto mb-4 h-12 w-12 text-slate-600" />
                <p className="text-slate-400">No results match this feed</p>
                <p className="mt-1 text-sm text-slate-500">
                  Loosen filters or add more indexers, then refresh.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-400">
                  <span className="font-medium text-slate-200">{results.length}</span> result
                  {results.length === 1 ? '' : 's'} after filters
                </p>
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
                            Age
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30">
                        {results.map((result, idx) => {
                          const isDead = result.seeders === 0
                          const isBookmarked = bookmarkIdByResultId[result.id] !== undefined
                          return (
                            <tr
                              key={result.id}
                              className={cn(
                                'group animate-fade-in transition-all hover:bg-slate-800/30',
                                isDead && 'opacity-60 hover:opacity-100',
                              )}
                              style={{ animationDelay: `${idx * 30}ms` }}
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
                                      <span className="text-[10px] text-slate-500">
                                        {result.indexer}
                                      </span>
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
            ? `“${pendingDelete.name}” will be removed. The indexers themselves are not affected.`
            : ''
        }
        confirmLabel="Delete feed"
        isLoading={deleteFeed.isPending}
      />
    </div>
  )
}
