import { useMemo, useState } from 'react'
import {
  Bookmark as BookmarkIcon,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileDown,
  Inbox,
  Magnet,
  StickyNote,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ConfirmDialog, EmptyState, LoadingSpinner, SendToClientModal } from '../components'
import {
  useBookmarks,
  useClientsStatus,
  useDeleteBookmark,
  useInstancesStatus,
  useLogHistory,
  useSendToClient,
} from '../hooks'
import { Bookmark, SearchResult } from '../types'
import { cn, formatRelative, formatDateTime } from '../utils'

function bookmarkToSearchResult(b: Bookmark): SearchResult {
  return {
    id: `bookmark-${b.id}`,
    title: b.title,
    source: b.source_instance_name,
    source_type: b.source_type,
    indexer: b.indexer,
    size: b.size_bytes ?? 0,
    size_formatted: b.size_formatted,
    seeders: 0,
    leechers: 0,
    date: null,
    category: b.category ?? 'Other',
    magnet_link: b.magnet_link,
    torrent_url: b.torrent_url,
    info_url: b.info_url,
    freeleech: false,
    download_volume_factor: null,
  }
}

export function BookmarksPage() {
  const { data, isLoading, isError } = useBookmarks()
  const { data: clientsStatus } = useClientsStatus()
  const { data: instancesStatus } = useInstancesStatus()
  const sendToClient = useSendToClient()
  const logHistory = useLogHistory()
  const deleteBookmark = useDeleteBookmark()

  const [pendingDelete, setPendingDelete] = useState<Bookmark | null>(null)
  const [pickerFor, setPickerFor] = useState<Bookmark | null>(null)
  const [notesFor, setNotesFor] = useState<Bookmark | null>(null)

  const defaultClient = clientsStatus?.find((c) => c.is_default && c.status === 'online') ?? null

  const bookmarks = data?.entries ?? []
  const total = data?.total ?? 0

  const sourceInstanceFor = (b: Bookmark) => {
    const list =
      b.source_type === 'jackett'
        ? (instancesStatus?.jackett ?? [])
        : (instancesStatus?.prowlarr ?? [])
    return list.find((i) => i.name === b.source_instance_name) ?? null
  }

  const handleSendClick = (bookmark: Bookmark, event: React.MouseEvent) => {
    if (defaultClient && !event.shiftKey) {
      const inst = sourceInstanceFor(bookmark)
      sendToClient.mutate({
        client_id: defaultClient.id,
        magnet_link: bookmark.magnet_link ?? undefined,
        torrent_url: bookmark.torrent_url ?? undefined,
        title: bookmark.title,
        size_bytes: bookmark.size_bytes ?? undefined,
        info_url: bookmark.info_url,
        source_type: bookmark.source_type,
        source_instance_id: inst?.id ?? null,
        source_instance_name: bookmark.source_instance_name,
        indexer: bookmark.indexer,
        search_query: null,
      })
      return
    }
    setPickerFor(bookmark)
  }

  const copyMagnet = async (bookmark: Bookmark) => {
    if (!bookmark.magnet_link) {
      toast.error('No magnet link saved for this bookmark')
      return
    }
    try {
      await navigator.clipboard.writeText(bookmark.magnet_link)
      toast.success('Magnet link copied to clipboard')
    } catch {
      toast.error('Failed to copy magnet link')
    }
  }

  const downloadTorrent = (bookmark: Bookmark) => {
    if (!bookmark.torrent_url) {
      toast.error('No torrent file saved for this bookmark')
      return
    }
    const inst = sourceInstanceFor(bookmark)
    logHistory.mutate({
      title: bookmark.title,
      size_bytes: bookmark.size_bytes,
      info_url: bookmark.info_url,
      torrent_url: bookmark.torrent_url,
      magnet_link: bookmark.magnet_link,
      source_type: bookmark.source_type,
      source_instance_id: inst?.id ?? null,
      source_instance_name: bookmark.source_instance_name,
      indexer: bookmark.indexer,
      search_query: null,
    })
    window.open(bookmark.torrent_url, '_blank')
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteBookmark.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      // toast handled in hook
    }
  }

  const pickerResult = useMemo<SearchResult | null>(
    () => (pickerFor ? bookmarkToSearchResult(pickerFor) : null),
    [pickerFor],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
              <BookmarkIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-100">Bookmarks</h2>
              <p className="text-xs text-slate-500">
                Saved results you can act on later — independent of your current search
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          <span className="font-mono text-slate-200">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'saved' : 'saved'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800/50 bg-slate-900/50 py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
          Failed to load bookmarks. Please try again.
        </div>
      ) : bookmarks.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-12 w-12" />}
          title="No bookmarks yet"
          description="On the Search page, click the bookmark icon next to any result to save it here."
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
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                    Saved
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {bookmarks.map((b, idx) => (
                  <tr
                    key={b.id}
                    className="group animate-fade-in transition-colors hover:bg-slate-800/30"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <td className="max-w-md px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        {b.info_url ? (
                          <a
                            href={b.info_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link text-sm font-medium leading-snug text-slate-200 transition-colors [overflow-wrap:anywhere] hover:text-cyan-300"
                            title={b.title}
                          >
                            {b.title}
                            <ExternalLink className="ml-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle opacity-0 transition-opacity group-hover/link:opacity-100" />
                          </a>
                        ) : (
                          <p
                            className="text-sm font-medium leading-snug text-slate-200 [overflow-wrap:anywhere]"
                            title={b.title}
                          >
                            {b.title}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {b.category && (
                            <span className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                              {b.category}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500">{b.indexer}</span>
                          {b.notes && (
                            <button
                              type="button"
                              onClick={() => setNotesFor(b)}
                              className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20"
                              title="View notes"
                            >
                              <StickyNote className="h-3 w-3" />
                              note
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium',
                          b.source_type === 'jackett'
                            ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                            : 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-400',
                        )}
                      >
                        {b.source_type === 'jackett' ? (
                          <Zap className="h-3 w-3" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        {b.source_instance_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-sm text-slate-300">
                      {b.size_formatted || '-'}
                    </td>
                    <td className="px-4 py-3 align-top text-sm text-slate-400">
                      <div
                        className="flex items-center gap-1.5"
                        title={formatDateTime(b.created_at)}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelative(b.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => copyMagnet(b)}
                          disabled={!b.magnet_link}
                          className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                          title={b.magnet_link ? 'Copy magnet' : 'No magnet stored'}
                        >
                          <Magnet className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadTorrent(b)}
                          disabled={!b.torrent_url}
                          className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-slate-700/50 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-30"
                          title={b.torrent_url ? 'Download .torrent' : 'No torrent file stored'}
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => handleSendClick(b, e)}
                          disabled={(!b.magnet_link && !b.torrent_url) || sendToClient.isPending}
                          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-3 py-2 text-xs font-medium text-emerald-400 transition-all hover:from-emerald-500/30 hover:to-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            !b.magnet_link && !b.torrent_url
                              ? 'No magnet or torrent file saved'
                              : defaultClient
                                ? `Send to ${defaultClient.name} (Shift+click to choose a different client)`
                                : 'Send to download client'
                          }
                        >
                          <Download className="h-4 w-4" />
                          Send
                        </button>
                        <button
                          onClick={() => setPendingDelete(b)}
                          className="rounded-lg bg-slate-800/50 p-2 text-slate-400 transition-all hover:bg-red-500/20 hover:text-red-400"
                          title="Remove bookmark"
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
        </div>
      )}

      <SendToClientModal
        isOpen={!!pickerResult}
        onClose={() => setPickerFor(null)}
        result={pickerResult}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Remove bookmark?"
        message={
          pendingDelete
            ? `Remove "${pendingDelete.title}" from bookmarks? This won't delete anything from your download client.`
            : ''
        }
        confirmLabel="Remove"
        isLoading={deleteBookmark.isPending}
      />

      {notesFor && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setNotesFor(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-400">Notes</p>
                <p className="mt-0.5 text-sm font-medium text-slate-200 [overflow-wrap:anywhere]">
                  {notesFor.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotesFor(null)}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-300 [overflow-wrap:anywhere]">
              {notesFor.notes}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
