import { useMemo, useState } from 'react'
import { Download, FileDown, Inbox, Magnet, StickyNote, Trash2, X } from 'lucide-react'
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
import { formatRelative, formatDateTime, sourceLabel, sourceTagClass } from '../utils'

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
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium text-slate-100">Bookmarks</h2>
          <p className="text-sm text-slate-400">Saved results to act on later</p>
        </div>
        <p className="font-mono text-xs text-slate-500">{total.toLocaleString()} saved</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900 py-16">
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
          description="Click the bookmark icon next to any search result to save it here"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-2 text-left text-xs font-normal text-slate-500">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-normal text-slate-500">Source</th>
                  <th className="px-4 py-2 text-right text-xs font-normal text-slate-500">Size</th>
                  <th className="px-4 py-2 text-left text-xs font-normal text-slate-500">Saved</th>
                  <th className="px-4 py-2 text-right text-xs font-normal text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {bookmarks.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t border-slate-800 transition-colors first:border-t-0 hover:bg-slate-800/50"
                  >
                    <td className="w-full max-w-0 px-4 py-3">
                      {b.info_url ? (
                        <a
                          href={b.info_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-sm text-slate-100 transition-colors hover:text-cyan-300"
                          title={b.title}
                        >
                          {b.title}
                        </a>
                      ) : (
                        <p className="truncate text-sm text-slate-100" title={b.title}>
                          {b.title}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {b.category && <span className="tag">{b.category}</span>}
                        <span className="px-1 text-2xs text-slate-500">{b.indexer}</span>
                        {b.notes && (
                          <button
                            type="button"
                            onClick={() => setNotesFor(b)}
                            className="tag tag-warn transition-colors hover:bg-amber-500/20"
                            title="View notes"
                          >
                            <StickyNote className="h-3 w-3" />
                            Note
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={sourceTagClass(b.source_type)}
                        title={sourceLabel(b.source_type)}
                      >
                        {b.source_instance_name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">
                      {b.size_formatted || '-'}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-sm text-slate-400"
                      title={formatDateTime(b.created_at)}
                    >
                      {formatRelative(b.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => copyMagnet(b)}
                          disabled={!b.magnet_link}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          title={b.magnet_link ? 'Copy magnet' : 'No magnet stored'}
                        >
                          <Magnet className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadTorrent(b)}
                          disabled={!b.torrent_url}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
                          title={b.torrent_url ? 'Download .torrent' : 'No torrent file stored'}
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => handleSendClick(b, e)}
                          disabled={(!b.magnet_link && !b.torrent_url) || sendToClient.isPending}
                          className="btn-secondary flex h-8 items-center gap-2 px-3 text-xs"
                          title={
                            !b.magnet_link && !b.torrent_url
                              ? 'No magnet or torrent file saved'
                              : defaultClient
                                ? `Send to ${defaultClient.name} (Shift+click to choose another client)`
                                : 'Send to download client'
                          }
                        >
                          <Download className="h-4 w-4" />
                          Send
                        </button>
                        <button
                          onClick={() => setPendingDelete(b)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-red-400"
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
            className="popover-shadow w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Notes</p>
                <p className="mt-1 font-mono text-sm text-slate-100 [overflow-wrap:anywhere]">
                  {notesFor.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotesFor(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
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
