import {
  Zap,
  Database,
  HardDrive,
  Server,
  Eye,
  RefreshCw,
  Settings,
  Trash2,
  Star,
} from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '../utils'
import { Status, InstanceType, ClientType } from '../types'

interface BaseCardProps {
  name: string
  url: string
  status: Status
  onTest?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isTesting?: boolean
}

interface InstanceCardProps extends BaseCardProps {
  type: InstanceType
  apiKey: string
  indexerCount: number | null
}

interface ClientCardProps extends BaseCardProps {
  clientType: ClientType
  isDefault?: boolean
}

export function InstanceCard({
  type,
  name,
  url,
  apiKey,
  status,
  indexerCount,
  onTest,
  onEdit,
  onDelete,
  isTesting,
}: InstanceCardProps) {
  const Icon = type === 'jackett' ? Zap : Database
  const iconColor = type === 'jackett' ? 'text-amber-400' : 'text-cyan-400'

  return (
    <div className="card group relative">
      {/* Top gradient line on hover */}
      <div className="absolute left-0 top-0 h-0.5 w-full bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', iconColor)} />
          <h4 className="font-semibold text-slate-200">{name}</h4>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Server className="h-3.5 w-3.5" />
          <span className="truncate font-mono text-xs">{url}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <Eye className="h-3.5 w-3.5" />
          <span className="font-mono text-xs">{apiKey}</span>
        </div>
        {indexerCount !== null && (
          <div className="flex items-center gap-2 text-slate-400">
            <Database className="h-3.5 w-3.5" />
            <span>{indexerCount} indexers</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-700/50 pt-3">
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {isTesting ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Test
        </button>
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
        >
          <Settings className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center rounded bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function ClientCard({
  clientType,
  name,
  url,
  status,
  onTest,
  onEdit,
  onDelete,
  isTesting,
  isDefault,
}: ClientCardProps) {
  return (
    <div
      className={cn(
        'card group relative',
        isDefault && 'border-amber-500/30 ring-1 ring-amber-500/20',
      )}
    >
      {/* Top gradient line on hover */}
      <div
        className={cn(
          'absolute left-0 top-0 h-0.5 w-full bg-gradient-to-r from-transparent to-transparent transition-opacity',
          isDefault
            ? 'via-amber-500/50 opacity-100'
            : 'via-violet-500/50 opacity-0 group-hover:opacity-100',
        )}
      />

      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="h-5 w-5 shrink-0 text-violet-400" />
          <h4 className="truncate font-semibold text-slate-200">{name}</h4>
          {isDefault && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400"
              title="Torrents send here automatically when no client is picked"
            >
              <Star className="h-3 w-3 fill-amber-400" />
              Default
            </span>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Server className="h-3.5 w-3.5" />
          <span className="truncate font-mono text-xs">{url}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <HardDrive className="h-3.5 w-3.5" />
          <span className="capitalize">{clientType}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-700/50 pt-3">
        <button
          onClick={onTest}
          disabled={isTesting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {isTesting ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Test
        </button>
        <button
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 rounded bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
        >
          <Settings className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center rounded bg-red-500/10 p-1.5 text-red-400 transition-colors hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
