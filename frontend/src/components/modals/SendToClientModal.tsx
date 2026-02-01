import { Download, HardDrive, ChevronRight } from 'lucide-react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { StatusBadge } from '../StatusBadge'
import { SearchResult, DownloadClientWithStatus } from '../../types'
import { useClientsStatus, useSendToClient } from '../../hooks'

interface SendToClientModalProps {
  isOpen: boolean
  onClose: () => void
  result: SearchResult | null
}

export function SendToClientModal({ isOpen, onClose, result }: SendToClientModalProps) {
  const { data: clients } = useClientsStatus()
  const sendToClient = useSendToClient()

  const onlineClients = clients?.filter((c) => c.status === 'online') ?? []
  const offlineClients = clients?.filter((c) => c.status === 'offline') ?? []

  const handleSend = async (client: DownloadClientWithStatus) => {
    if (!result) return

    try {
      await sendToClient.mutateAsync({
        client_id: client.id,
        magnet_link: result.magnet_link ?? undefined,
        torrent_url: result.torrent_url ?? undefined,
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
      title="Send to Download Client"
      titleIcon={<Download className="h-5 w-5 text-emerald-400" />}
      size="lg"
      footer={
        <button onClick={onClose} className="btn-secondary w-full">
          Cancel
        </button>
      }
    >
      <div>
        {/* Torrent Info */}
        <div className="mb-4 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
          <p className="line-clamp-2 text-sm font-medium text-slate-200">{result.title}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
            <span>{result.size_formatted}</span>
            <span>-</span>
            <span className="text-emerald-400">{result.seeders} seeders</span>
            <span>-</span>
            <span>{result.source}</span>
          </div>
        </div>

        {/* Online Clients */}
        {onlineClients.length > 0 ? (
          <>
            <h4 className="mb-3 text-sm font-medium text-slate-300">Select Download Client</h4>
            <div className="space-y-2">
              {onlineClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleSend(client)}
                  disabled={sendToClient.isPending}
                  className="group flex w-full items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 transition-all hover:border-cyan-500/30 hover:bg-slate-800 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-purple-500/20">
                      <HardDrive className="h-5 w-5 text-violet-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-200">{client.name}</p>
                      <p className="font-mono text-xs text-slate-400">{client.url}</p>
                    </div>
                  </div>
                  {sendToClient.isPending ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-slate-500 transition-colors group-hover:text-cyan-400" />
                  )}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="py-6 text-center text-slate-400">
            <HardDrive className="mx-auto mb-2 h-12 w-12 text-slate-600" />
            <p>No online download clients available</p>
          </div>
        )}

        {/* Offline Clients */}
        {offlineClients.length > 0 && (
          <div className="mt-4 border-t border-slate-700/50 pt-4">
            <p className="mb-2 text-xs text-slate-500">Offline clients</p>
            {offlineClients.map((client) => (
              <div
                key={client.id}
                className="flex items-center gap-3 rounded-lg bg-slate-800/30 p-3 opacity-50"
              >
                <HardDrive className="h-5 w-5 text-slate-500" />
                <span className="text-slate-400">{client.name}</span>
                <StatusBadge status="offline" />
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
