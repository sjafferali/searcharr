import { Download, HardDrive, ChevronRight, AlertCircle, Star } from 'lucide-react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { StatusBadge } from '../StatusBadge'
import { SearchResult, DownloadClientWithStatus } from '../../types'
import { useClientsStatus, useInstancesStatus, useSendToClient } from '../../hooks'
import { sourceLabel, sourceTagClass } from '../../utils'

interface SendToClientModalProps {
  isOpen: boolean
  onClose: () => void
  result: SearchResult | null
  searchQuery?: string
}

export function SendToClientModal({
  isOpen,
  onClose,
  result,
  searchQuery,
}: SendToClientModalProps) {
  const { data: clients } = useClientsStatus()
  const { data: instancesStatus } = useInstancesStatus()
  const sendToClient = useSendToClient()

  const onlineClients = clients?.filter((c) => c.status === 'online') ?? []
  const offlineClients = clients?.filter((c) => c.status === 'offline') ?? []

  // Check if the torrent can be sent (has either magnet link or torrent URL)
  const canSendTorrent = result?.magnet_link || result?.torrent_url

  const handleSend = async (client: DownloadClientWithStatus) => {
    if (!result) return

    const instances =
      result.source_type === 'jackett'
        ? (instancesStatus?.jackett ?? [])
        : (instancesStatus?.prowlarr ?? [])
    const sourceInstance = instances.find((i) => i.name === result.source)

    try {
      await sendToClient.mutateAsync({
        client_id: client.id,
        magnet_link: result.magnet_link ?? undefined,
        torrent_url: result.torrent_url ?? undefined,
        title: result.title,
        size_bytes: result.size,
        info_url: result.info_url,
        source_type: result.source_type,
        source_instance_id: sourceInstance?.id ?? null,
        source_instance_name: result.source,
        indexer: result.indexer,
        search_query: searchQuery?.trim() || null,
      })
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  if (!result) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Send to download client"
      titleIcon={<Download className="h-4 w-4 text-slate-500" />}
      size="lg"
      footer={
        <button onClick={onClose} className="btn-secondary w-full">
          Cancel
        </button>
      }
    >
      <div>
        {/* Torrent Info */}
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-3">
          <p className="line-clamp-2 font-mono text-sm text-slate-100">{result.title}</p>
          <div className="mt-2 flex items-center gap-2 font-mono text-xs text-slate-400">
            <span>{result.size_formatted}</span>
            <span>·</span>
            <span className={result.seeders === 0 ? 'text-red-400' : 'text-emerald-400'}>
              {result.seeders} seeders
            </span>
            <span>·</span>
            <span
              className={sourceTagClass(result.source_type)}
              title={sourceLabel(result.source_type)}
            >
              {result.source}
            </span>
          </div>
        </div>

        {/* Warning if torrent cannot be sent */}
        {!canSendTorrent && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm font-medium">Cannot send to client</p>
            </div>
            <p className="mt-1 text-xs text-amber-400/80">
              This torrent has no magnet link or torrent file URL
            </p>
          </div>
        )}

        {/* Online Clients */}
        {canSendTorrent && onlineClients.length > 0 ? (
          <>
            <h4 className="mb-3 text-sm font-medium text-slate-200">Select download client</h4>
            <div className="space-y-2">
              {onlineClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleSend(client)}
                  disabled={sendToClient.isPending}
                  className="group flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800 p-3 transition-colors hover:border-slate-600 hover:bg-slate-700 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <HardDrive className="h-4 w-4 flex-shrink-0 text-slate-500" />
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-200">{client.name}</p>
                        {client.is_default && (
                          <span className="tag tag-warn">
                            <Star className="h-3 w-3 fill-amber-400" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-xs text-slate-400">{client.url}</p>
                    </div>
                  </div>
                  {sendToClient.isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500 transition-colors group-hover:text-slate-100" />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : canSendTorrent ? (
          <div className="py-6 text-center text-slate-400">
            <HardDrive className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-sm">No download clients online</p>
            <p className="mt-1 text-xs text-slate-500">
              Configure a download client in the Clients tab
            </p>
          </div>
        ) : null}

        {/* Offline Clients */}
        {canSendTorrent && offlineClients.length > 0 && (
          <div className="mt-6 border-t border-slate-700 pt-4">
            <p className="mb-2 text-xs text-slate-500">Offline clients</p>
            {offlineClients.map((client) => (
              <div key={client.id} className="flex items-center gap-3 p-3 opacity-50">
                <HardDrive className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-400">{client.name}</span>
                <StatusBadge status="offline" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
