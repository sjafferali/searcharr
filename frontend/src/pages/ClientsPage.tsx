import { useState } from 'react'
import { HardDrive, Plus } from 'lucide-react'
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
        <div>
          <h2 className="text-xl font-medium text-slate-100">Download clients</h2>
          <p className="font-mono text-sm text-slate-400">
            {clientList.length} configured · {onlineCount} online
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Add client
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
              isDefault={client.is_default}
              isTesting={testingIds.has(client.id)}
              onTest={() => handleTest(client.id)}
              onEdit={() => setEditClient(client)}
              onDelete={() => setDeleteClientData(client)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<HardDrive className="h-8 w-8" />}
          title="No download clients configured"
          description="Add a download client to send torrents directly from search results"
          action={{
            label: 'Add your first client',
            onClick: () => setShowAddModal(true),
          }}
        />
      )}

      {/* Supported Clients Info */}
      <p className="text-xs text-slate-500">
        Supported clients: {supportedClients.map((ct) => ct.label).join(', ')}
      </p>

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
        title="Delete client"
        message={`Delete "${deleteClientData?.name}"? This cannot be undone.`}
        isLoading={deleteClient.isPending}
      />
    </div>
  )
}
