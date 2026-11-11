import { useEffect, useMemo, useState } from 'react'
import { Database, Globe, Lock, Search, Star } from 'lucide-react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { cn } from '../../utils'
import {
  useJackettIndexers,
  useProwlarrIndexers,
  useUpdateJackett,
  useUpdateProwlarr,
} from '../../hooks'
import {
  IndexerInfo,
  InstanceType,
  JackettInstanceWithStatus,
  ProwlarrInstanceWithStatus,
} from '../../types'

interface DefaultSourcesModalProps {
  isOpen: boolean
  onClose: () => void
  type: InstanceType
  instance: JackettInstanceWithStatus | ProwlarrInstanceWithStatus | null
}

function indexerTypeBadge(type: string | null | undefined) {
  if (!type) return null
  const lower = type.toLowerCase()
  if (lower.includes('private')) {
    return { label: 'Private', icon: Lock, className: 'tag-bad' }
  }
  if (lower.includes('public')) {
    return { label: 'Public', icon: Globe, className: 'tag-good' }
  }
  return { label: type, icon: Database, className: '' }
}

export function DefaultSourcesModal({ isOpen, onClose, type, instance }: DefaultSourcesModalProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')

  const isJackett = type === 'jackett'
  const instanceId = instance?.id ?? null
  const jackettQuery = useJackettIndexers(isJackett ? instanceId : null, isJackett && isOpen)
  const prowlarrQuery = useProwlarrIndexers(!isJackett ? instanceId : null, !isJackett && isOpen)
  const query = isJackett ? jackettQuery : prowlarrQuery

  const updateJackett = useUpdateJackett()
  const updateProwlarr = useUpdateProwlarr()
  const isSaving = updateJackett.isPending || updateProwlarr.isPending

  // Seed the selection from the saved defaults each time the modal opens.
  useEffect(() => {
    if (isOpen && instance) {
      setSelected(instance.default_indexers ?? [])
      setFilter('')
    }
  }, [isOpen, instance])

  const indexers: IndexerInfo[] = useMemo(() => query.data?.indexers ?? [], [query.data])
  const filteredIndexers = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return indexers
    return indexers.filter((i) => i.name.toLowerCase().includes(term))
  }, [indexers, filter])

  const toggle = (indexerId: string) => {
    setSelected((prev) =>
      prev.includes(indexerId) ? prev.filter((i) => i !== indexerId) : [...prev, indexerId],
    )
  }

  const handleSave = async () => {
    if (!instance) return
    // Drop selections for indexers that no longer exist on the instance.
    const availableIds = new Set(indexers.map((i) => i.id))
    const ids = indexers.length > 0 ? selected.filter((id) => availableIds.has(id)) : selected

    try {
      if (isJackett) {
        await updateJackett.mutateAsync({ id: instance.id, data: { default_indexers: ids } })
      } else {
        await updateProwlarr.mutateAsync({ id: instance.id, data: { default_indexers: ids } })
      }
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Default search sources"
      titleIcon={<Star className="h-4 w-4 text-slate-500" />}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {selected.length === 0 ? (
              'No default sources'
            ) : (
              <>
                <span className="font-mono text-slate-200">{selected.length}</span> indexer
                {selected.length === 1 ? '' : 's'} selected
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary" disabled={isSaving}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || query.isLoading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {isSaving && <LoadingSpinner size="sm" />}
              Save defaults
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-400">
          Indexers marked as default on{' '}
          <span className="font-medium text-slate-200">{instance?.name}</span> are pre-selected as
          search sources when the Search page opens. Instances with no default sources are left out
          of that pre-selection — you can always adjust sources on the Search page itself.
        </p>

        {query.isLoading && (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <LoadingSpinner size="sm" />
            <span className="ml-2 text-sm">Loading indexers…</span>
          </div>
        )}

        {query.isError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            Failed to load indexers. Verify the instance is online and try again.
          </p>
        )}

        {query.isSuccess && indexers.length === 0 && (
          <p className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400">
            No indexers configured on this instance
          </p>
        )}

        {query.isSuccess && indexers.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-40 flex-1">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter indexers"
                  className="input h-8 py-0 pl-8 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelected(indexers.map((i) => i.id))}
                className="btn-secondary h-8 px-3 py-0 text-xs"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                disabled={selected.length === 0}
                className="btn-secondary h-8 px-3 py-0 text-xs"
              >
                Clear
              </button>
            </div>

            <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredIndexers.map((indexer) => {
                const isSelected = selected.includes(indexer.id)
                const badge = indexerTypeBadge(indexer.type)
                return (
                  <button
                    key={indexer.id}
                    type="button"
                    onClick={() => toggle(indexer.id)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                      isSelected
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-slate-100'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Star
                        className={cn(
                          'h-3 w-3 flex-shrink-0 transition-colors',
                          isSelected ? 'fill-amber-400 text-amber-400' : 'text-slate-600',
                        )}
                      />
                      <span className="truncate font-mono">{indexer.name}</span>
                    </span>
                    {badge && (
                      <span className={cn('tag', badge.className)}>
                        <badge.icon className="h-3 w-3" />
                        {badge.label}
                      </span>
                    )}
                  </button>
                )
              })}
              {filteredIndexers.length === 0 && (
                <p className="col-span-full rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-500">
                  No indexers match “{filter}”
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
