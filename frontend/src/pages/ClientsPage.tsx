import { useState } from 'react'
import { HardDrive, Plus, CheckCircle2 } from 'lucide-react'
import {
  ClientCard,
  EmptyState,
  ConfirmDialog,
  AddClientModal,
  EditClientModal,
} from '../components'
import { LoadingSpinner } from '../components'
import { useClientsStatus, useDeleteClient, useTestClient } from '../hooks'
import { DownloadClientWithStatus, ClientType } from '../types'

const supportedClients: { value: ClientType; label: string }[] = [
  { value: 'qbittorrent', label: 'qBittorrent' },
]

export function ClientsPage() {
  const { data: clients, isLoading } = useClientsStatus()
  const deleteClient = useDeleteClient()
  const testClient = useTestClient()

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [editClient, setEditClient] = useState<DownloadClientWithStatus | null>(null)
  const [deleteClientData, setDeleteClientData] = useState<DownloadClientWithStatus | null>(null)

  // Testing states
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set())

  const handleTest = async (id: number) => {
    setTestingIds((prev) => new Set(prev).add(id))
    try {
      await testClient.mutateAsync(id)
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteClientData) return

    try {
      await deleteClient.mutateAsync(deleteClientData.id)
      setDeleteClientData(null)
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const clientList = clients ?? []
  const onlineCount = clientList.filter((c) => c.status === 'online').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-purple-500/20">
            <HardDrive className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Download Clients</h2>
            <p className="text-xs text-slate-400">
              {clientList.length} configured - {onlineCount} online
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-400 transition-colors hover:bg-violet-500/20"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </button>
      </div>

      {/* Client Cards */}
      {clientList.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clientList.map((client) => (
            <ClientCard
              key={client.id}
              clientType={client.client_type}
              name={client.name}
              url={client.url}
              status={client.status}
              isTesting={testingIds.has(client.id)}
              onTest={() => handleTest(client.id)}
              onEdit={() => setEditClient(client)}
              onDelete={() => setDeleteClientData(client)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<HardDrive className="h-12 w-12" />}
          title="No download clients configured"
          description="Add a download client to send torrents directly from search results"
          action={{
            label: 'Add your first client',
            onClick: () => setShowAddModal(true),
          }}
        />
      )}

      {/* Supported Clients Info */}
      <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-6">
        <h3 className="mb-4 text-sm font-medium text-slate-300">Supported Download Clients</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {supportedClients.map((ct) => (
            <div
              key={ct.value}
              className="flex items-center gap-2 rounded-lg bg-slate-800/30 px-3 py-2"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-slate-300">{ct.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Additional clients may be added in future releases.
        </p>
      </div>

      {/* Add Modal */}
      <AddClientModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

      {/* Edit Modal */}
      <EditClientModal
        isOpen={!!editClient}
        onClose={() => setEditClient(null)}
        client={editClient}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteClientData}
        onClose={() => setDeleteClientData(null)}
        onConfirm={handleDelete}
        title="Delete Client"
        message={`Are you sure you want to delete "${deleteClientData?.name}"? This action cannot be undone.`}
        isLoading={deleteClient.isPending}
      />
    </div>
  )
}
