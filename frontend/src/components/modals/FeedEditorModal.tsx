import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Check,
  Database,
  Filter,
  Globe,
  Layers,
  Lock,
  Rss,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import {
  useCreateFeed,
  useInstancesStatus,
  useJackettIndexers,
  useProwlarrIndexers,
  useUpdateFeed,
} from '../../hooks'
import {
  Feed,
  FeedFilters,
  FeedIndexerRef,
  IndexerInfo,
  SearchCategory,
  SourceType,
} from '../../types'
import { cn, formatBytes, parseSize } from '../../utils'

interface FeedEditorModalProps {
  isOpen: boolean
  onClose: () => void
  feed: Feed | null
}

const CATEGORIES: SearchCategory[] = [
  'All',
  'Movies',
  'TV',
  'Music',
  'Software',
  'Games',
  'Books',
  'Anime',
  'Other',
]

const DEFAULT_FILTERS: FeedFilters = {
  category: 'All',
  freeleech_only: false,
  min_seeders: 0,
  min_size_bytes: null,
  max_size_bytes: null,
  include_regex: null,
  exclude_regex: null,
}

function refKey(ref: {
  source_type: SourceType
  source_instance_id: number
  indexer_id: string
}): string {
  return `${ref.source_type}:${ref.source_instance_id}:${ref.indexer_id}`
}

function safeParseSize(input: string): { bytes: number | null; valid: boolean } {
  const trimmed = input.trim()
  if (!trimmed) return { bytes: null, valid: true }
  const bytes = parseSize(trimmed)
  return { bytes, valid: bytes !== null }
}

function bytesToInputString(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return ''
  return formatBytes(bytes).replace(/\s+/g, '')
}

export function FeedEditorModal({ isOpen, onClose, feed }: FeedEditorModalProps) {
  const isEditing = feed !== null
  const { data: instancesStatus } = useInstancesStatus()
  const createFeed = useCreateFeed()
  const updateFeed = useUpdateFeed()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<Map<string, FeedIndexerRef>>(new Map())
  const [minSizeText, setMinSizeText] = useState('')
  const [maxSizeText, setMaxSizeText] = useState('')

  useEffect(() => {
    if (!isOpen) return
    if (feed) {
      setName(feed.name)
      setDescription(feed.description ?? '')
      setFilters(feed.filters)
      const map = new Map<string, FeedIndexerRef>()
      for (const ref of feed.indexers) {
        map.set(refKey(ref), ref)
      }
      setSelected(map)
      setMinSizeText(bytesToInputString(feed.filters.min_size_bytes))
      setMaxSizeText(bytesToInputString(feed.filters.max_size_bytes))
    } else {
      setName('')
      setDescription('')
      setFilters(DEFAULT_FILTERS)
      setSelected(new Map())
      setMinSizeText('')
      setMaxSizeText('')
    }
  }, [isOpen, feed])

  const minSizeParsed = useMemo(() => safeParseSize(minSizeText), [minSizeText])
  const maxSizeParsed = useMemo(() => safeParseSize(maxSizeText), [maxSizeText])

  const isLoading = createFeed.isPending || updateFeed.isPending
  const indexerCount = selected.size
  const instanceCount = useMemo(() => {
    const set = new Set<string>()
    for (const ref of selected.values()) {
      set.add(`${ref.source_type}:${ref.source_instance_id}`)
    }
    return set.size
  }, [selected])

  const handleToggle = (ref: FeedIndexerRef) => {
    setSelected((prev) => {
      const next = new Map(prev)
      const key = refKey(ref)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, ref)
      }
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (indexerCount === 0) {
      toast.error('Pick at least one indexer')
      return
    }
    if (!minSizeParsed.valid) {
      toast.error('Minimum size: use a unit like KB, MB, GB, TB')
      return
    }
    if (!maxSizeParsed.valid) {
      toast.error('Maximum size: use a unit like KB, MB, GB, TB')
      return
    }

    const finalFilters: FeedFilters = {
      ...filters,
      min_size_bytes: minSizeParsed.bytes,
      max_size_bytes: maxSizeParsed.bytes,
      include_regex: filters.include_regex?.trim() || null,
      exclude_regex: filters.exclude_regex?.trim() || null,
    }

    const indexers = Array.from(selected.values())

    try {
      if (feed) {
        await updateFeed.mutateAsync({
          id: feed.id,
          payload: {
            name: name.trim(),
            description: description.trim() || null,
            filters: finalFilters,
            indexers,
          },
        })
      } else {
        await createFeed.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          filters: finalFilters,
          indexers,
        })
      }
      onClose()
    } catch {
      // Errors surfaced by the mutation hooks
    }
  }

  const jacketts = instancesStatus?.jackett ?? []
  const prowlarrs = instancesStatus?.prowlarr ?? []

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit feed' : 'Create feed'}
      titleIcon={<Rss className="h-5 w-5 text-cyan-400" />}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {indexerCount === 0 ? (
              <span className="text-rose-300">Pick at least one indexer to save.</span>
            ) : (
              <>
                <span className="font-medium text-slate-200">{indexerCount}</span> indexer
                {indexerCount === 1 ? '' : 's'} across{' '}
                <span className="font-medium text-slate-200">{instanceCount}</span> instance
                {instanceCount === 1 ? '' : 's'}
              </>
            )}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="btn-primary flex items-center justify-center gap-2"
            >
              {isLoading && <LoadingSpinner size="sm" />}
              {isEditing ? 'Save changes' : 'Create feed'}
            </button>
          </div>
        </div>
      }
    >
      <div className="-mx-1 max-h-[65vh] space-y-5 overflow-y-auto px-1">
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Freeleech Watch"
                className="input"
                autoFocus
              />
            </div>
            <div className="sm:w-44">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, category: e.target.value as SearchCategory }))
                }
                className="input cursor-pointer"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this feed is for"
              className="input"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
          <header className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Filter className="h-3.5 w-3.5 text-cyan-400" />
            Filters
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2.5 transition-colors hover:border-emerald-500/40">
              <input
                type="checkbox"
                checked={filters.freeleech_only}
                onChange={(e) => setFilters((f) => ({ ...f, freeleech_only: e.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-emerald-500"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  Freeleech only
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Hide items that count against ratio.
                </p>
              </div>
            </label>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Min seeders
              </label>
              <input
                type="number"
                min={0}
                value={filters.min_seeders || ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, min_seeders: Number(e.target.value) || 0 }))
                }
                placeholder="0"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Min size
              </label>
              <input
                type="text"
                value={minSizeText}
                onChange={(e) => setMinSizeText(e.target.value)}
                placeholder="e.g. 100MB"
                className={cn('input', !minSizeParsed.valid && 'border-rose-500/60')}
              />
              {!minSizeParsed.valid && (
                <p className="mt-1 text-[10px] text-rose-300">Use a unit like KB, MB, GB, TB.</p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Max size
              </label>
              <input
                type="text"
                value={maxSizeText}
                onChange={(e) => setMaxSizeText(e.target.value)}
                placeholder="e.g. 20GB"
                className={cn('input', !maxSizeParsed.valid && 'border-rose-500/60')}
              />
              {!maxSizeParsed.valid && (
                <p className="mt-1 text-[10px] text-rose-300">Use a unit like KB, MB, GB, TB.</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Title must match (regex, optional)
              </label>
              <input
                type="text"
                value={filters.include_regex ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, include_regex: e.target.value || null }))
                }
                placeholder="e.g. 2160p|FLAC"
                className="input-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Title must NOT match (regex, optional)
              </label>
              <input
                type="text"
                value={filters.exclude_regex ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, exclude_regex: e.target.value || null }))
                }
                placeholder="e.g. CAM|HDTS"
                className="input-mono"
              />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <header className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              Indexers
            </h4>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                indexerCount > 0
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700/50 bg-slate-800/40 text-slate-400',
              )}
            >
              {indexerCount} selected
            </span>
          </header>
          {jacketts.length === 0 && prowlarrs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700/60 bg-slate-900/30 p-4 text-center text-xs text-slate-500">
              No instances configured. Add a Jackett or Prowlarr instance first.
            </div>
          ) : (
            <div className="space-y-2">
              {jacketts.map((inst) => (
                <FeedInstanceSection
                  key={`jackett-${inst.id}`}
                  type="jackett"
                  instanceId={inst.id}
                  instanceName={inst.name}
                  isOnline={inst.status === 'online'}
                  selected={selected}
                  onToggle={handleToggle}
                />
              ))}
              {prowlarrs.map((inst) => (
                <FeedInstanceSection
                  key={`prowlarr-${inst.id}`}
                  type="prowlarr"
                  instanceId={inst.id}
                  instanceName={inst.name}
                  isOnline={inst.status === 'online'}
                  selected={selected}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

interface FeedInstanceSectionProps {
  type: SourceType
  instanceId: number
  instanceName: string
  isOnline: boolean
  selected: Map<string, FeedIndexerRef>
  onToggle: (ref: FeedIndexerRef) => void
}

function FeedInstanceSection({
  type,
  instanceId,
  instanceName,
  isOnline,
  selected,
  onToggle,
}: FeedInstanceSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [filter, setFilter] = useState('')

  const isJackett = type === 'jackett'
  const jackettQuery = useJackettIndexers(isJackett ? instanceId : null, isJackett && expanded)
  const prowlarrQuery = useProwlarrIndexers(!isJackett ? instanceId : null, !isJackett && expanded)
  const query = isJackett ? jackettQuery : prowlarrQuery
  const indexers = useMemo<IndexerInfo[]>(() => query.data?.indexers ?? [], [query.data])

  const filteredIndexers = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return indexers
    return indexers.filter((i) => i.name.toLowerCase().includes(term))
  }, [indexers, filter])

  const selectedForInstance = useMemo(() => {
    let count = 0
    for (const key of selected.keys()) {
      if (key.startsWith(`${type}:${instanceId}:`)) count++
    }
    return count
  }, [selected, type, instanceId])

  const Icon = isJackett ? Zap : Database
  const accent = isJackett
    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'

  return (
    <div
      className={cn(
        'rounded-lg border bg-slate-900/40 transition-colors',
        selectedForInstance > 0 ? accent.split(' ')[0] : 'border-slate-800/60',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-800/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('h-4 w-4 flex-shrink-0', isJackett ? 'text-amber-400' : 'text-cyan-400')}
          />
          <span className="truncate text-sm font-medium text-slate-200">{instanceName}</span>
          {!isOnline && (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-300">
              Offline
            </span>
          )}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              selectedForInstance > 0
                ? accent
                : 'border-slate-700/50 bg-slate-800/40 text-slate-400',
            )}
          >
            {selectedForInstance > 0 ? `${selectedForInstance} selected` : 'None selected'}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-800/60 p-3">
          {query.isLoading && (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <LoadingSpinner size="sm" />
              <span className="ml-2 text-xs">Loading indexers…</span>
            </div>
          )}
          {query.isError && (
            <p className="rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              Failed to load indexers. Verify the instance is online.
            </p>
          )}
          {query.isSuccess && indexers.length === 0 && (
            <p className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs text-slate-400">
              No indexers configured on this instance.
            </p>
          )}
          {query.isSuccess && indexers.length > 0 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter indexers"
                  className="w-full rounded-md border border-slate-700/50 bg-slate-800/40 py-1.5 pl-7 pr-2 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
                />
              </div>
              <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredIndexers.map((indexer) => {
                  const ref: FeedIndexerRef = {
                    source_type: type,
                    source_instance_id: instanceId,
                    source_instance_name: instanceName,
                    indexer_id: indexer.id,
                    indexer_name: indexer.name,
                  }
                  const isSelected = selected.has(refKey(ref))
                  const badge = indexerTypeBadge(indexer.type)
                  return (
                    <button
                      key={indexer.id}
                      type="button"
                      onClick={() => onToggle(ref)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-all',
                        isSelected
                          ? isJackett
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                          : 'border-slate-700/50 bg-slate-800/30 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border',
                            isSelected
                              ? isJackett
                                ? 'border-amber-400 bg-amber-400/30 text-amber-100'
                                : 'border-cyan-400 bg-cyan-400/30 text-cyan-100'
                              : 'border-slate-600 bg-slate-800/40',
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{indexer.name}</span>
                      </span>
                      {badge && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium',
                            badge.className,
                          )}
                        >
                          <badge.icon className="h-2.5 w-2.5" />
                          {badge.label}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function indexerTypeBadge(type: string | null | undefined) {
  if (!type) return null
  const lower = type.toLowerCase()
  if (lower.includes('private')) {
    return {
      label: 'Private',
      icon: Lock,
      className: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
    }
  }
  if (lower.includes('public')) {
    return {
      label: 'Public',
      icon: Globe,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    }
  }
  return {
    label: type,
    icon: Database,
    className: 'border-slate-600/40 bg-slate-700/40 text-slate-300',
  }
}
