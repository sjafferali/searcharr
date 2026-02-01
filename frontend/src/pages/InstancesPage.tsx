import { useState } from 'react'
import { Zap, Database, Plus } from 'lucide-react'
import {
  InstanceCard,
  EmptyState,
  ConfirmDialog,
  AddInstanceModal,
  EditInstanceModal,
} from '../components'
import { LoadingSpinner } from '../components'
import {
  useInstancesStatus,
  useDeleteJackett,
  useDeleteProwlarr,
  useTestJackett,
  useTestProwlarr,
} from '../hooks'
import { JackettInstanceWithStatus, ProwlarrInstanceWithStatus, InstanceType } from '../types'

export function InstancesPage() {
  const { data: instancesStatus, isLoading } = useInstancesStatus()
  const deleteJackett = useDeleteJackett()
  const deleteProwlarr = useDeleteProwlarr()
  const testJackett = useTestJackett()
  const testProwlarr = useTestProwlarr()

  // Modal states
  const [addModalType, setAddModalType] = useState<InstanceType | null>(null)
  const [editInstance, setEditInstance] = useState<{
    type: InstanceType
    instance: JackettInstanceWithStatus | ProwlarrInstanceWithStatus
  } | null>(null)
  const [deleteInstance, setDeleteInstance] = useState<{
    type: InstanceType
    instance: JackettInstanceWithStatus | ProwlarrInstanceWithStatus
  } | null>(null)

  // Testing states
  const [testingJackettIds, setTestingJackettIds] = useState<Set<number>>(new Set())
  const [testingProwlarrIds, setTestingProwlarrIds] = useState<Set<number>>(new Set())

  const handleTestJackett = async (id: number) => {
    setTestingJackettIds((prev) => new Set(prev).add(id))
    try {
      await testJackett.mutateAsync(id)
    } finally {
      setTestingJackettIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleTestProwlarr = async (id: number) => {
    setTestingProwlarrIds((prev) => new Set(prev).add(id))
    try {
      await testProwlarr.mutateAsync(id)
    } finally {
      setTestingProwlarrIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteInstance) return

    try {
      if (deleteInstance.type === 'jackett') {
        await deleteJackett.mutateAsync(deleteInstance.instance.id)
      } else {
        await deleteProwlarr.mutateAsync(deleteInstance.instance.id)
      }
      setDeleteInstance(null)
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

  const jackettInstances = instancesStatus?.jackett ?? []
  const prowlarrInstances = instancesStatus?.prowlarr ?? []

  return (
    <div className="space-y-8">
      {/* Jackett Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 to-orange-500/20">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Jackett Instances</h2>
              <p className="text-xs text-slate-400">
                {jackettInstances.length} configured -{' '}
                {jackettInstances.filter((i) => i.status === 'online').length} online
              </p>
            </div>
          </div>
          <button
            onClick={() => setAddModalType('jackett')}
            className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <Plus className="h-4 w-4" />
            Add Jackett
          </button>
        </div>

        {jackettInstances.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jackettInstances.map((instance) => (
              <InstanceCard
                key={instance.id}
                type="jackett"
                name={instance.name}
                url={instance.url}
                apiKey={instance.api_key}
                status={instance.status}
                indexerCount={instance.indexer_count}
                isTesting={testingJackettIds.has(instance.id)}
                onTest={() => handleTestJackett(instance.id)}
                onEdit={() => setEditInstance({ type: 'jackett', instance })}
                onDelete={() => setDeleteInstance({ type: 'jackett', instance })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Zap className="h-12 w-12" />}
            title="No Jackett instances configured"
            action={{
              label: 'Add your first instance',
              onClick: () => setAddModalType('jackett'),
            }}
          />
        )}
      </section>

      {/* Prowlarr Section */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
              <Database className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Prowlarr Instances</h2>
              <p className="text-xs text-slate-400">
                {prowlarrInstances.length} configured -{' '}
                {prowlarrInstances.filter((i) => i.status === 'online').length} online
              </p>
            </div>
          </div>
          <button
            onClick={() => setAddModalType('prowlarr')}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
          >
            <Plus className="h-4 w-4" />
            Add Prowlarr
          </button>
        </div>

        {prowlarrInstances.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {prowlarrInstances.map((instance) => (
              <InstanceCard
                key={instance.id}
                type="prowlarr"
                name={instance.name}
                url={instance.url}
                apiKey={instance.api_key}
                status={instance.status}
                indexerCount={instance.indexer_count}
                isTesting={testingProwlarrIds.has(instance.id)}
                onTest={() => handleTestProwlarr(instance.id)}
                onEdit={() => setEditInstance({ type: 'prowlarr', instance })}
                onDelete={() => setDeleteInstance({ type: 'prowlarr', instance })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Database className="h-12 w-12" />}
            title="No Prowlarr instances configured"
            action={{
              label: 'Add your first instance',
              onClick: () => setAddModalType('prowlarr'),
            }}
          />
        )}
      </section>

      {/* Add Modal */}
      {addModalType && (
        <AddInstanceModal isOpen={true} onClose={() => setAddModalType(null)} type={addModalType} />
      )}

      {/* Edit Modal */}
      {editInstance && (
        <EditInstanceModal
          isOpen={true}
          onClose={() => setEditInstance(null)}
          type={editInstance.type}
          instance={editInstance.instance}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteInstance}
        onClose={() => setDeleteInstance(null)}
        onConfirm={handleDelete}
        title="Delete Instance"
        message={`Are you sure you want to delete "${deleteInstance?.instance.name}"? This action cannot be undone.`}
        isLoading={deleteJackett.isPending || deleteProwlarr.isPending}
      />
    </div>
  )
}
