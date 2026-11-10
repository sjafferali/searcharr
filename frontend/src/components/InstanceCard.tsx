import { ReactNode } from 'react'
import { RefreshCw, Settings, Trash2, Star } from 'lucide-react'
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
  defaultSourceCount?: number
  onConfigureDefaults?: () => void
}

interface ClientCardProps extends BaseCardProps {
  clientType: ClientType
  isDefault?: boolean
}

const iconButton =
  'flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100'

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="truncate text-right font-mono text-slate-300">{children}</span>
    </div>
  )
}

interface CardActionsProps {
  onTest?: () => void
  onEdit?: () => void
  onDelete?: () => void
  isTesting?: boolean
  children?: ReactNode
}

function CardActions({ onTest, onEdit, onDelete, isTesting, children }: CardActionsProps) {
  return (
    <div className="mt-4 flex items-center gap-1 border-t border-slate-800 pt-3">
      <button
        onClick={onTest}
        disabled={isTesting}
        className="btn-secondary flex h-8 items-center gap-2 px-3 py-0 text-xs"
      >
        {isTesting ? <LoadingSpinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
        Test
      </button>
      <div className="ml-auto flex items-center gap-1">
        {children}
        <button onClick={onEdit} title="Edit" aria-label="Edit" className={iconButton}>
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
          className={cn(iconButton, 'hover:text-red-400')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function InstanceCard({
  name,
  url,
  apiKey,
  status,
  indexerCount,
  defaultSourceCount = 0,
  onConfigureDefaults,
  onTest,
  onEdit,
  onDelete,
  isTesting,
}: InstanceCardProps) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <h4 className="truncate text-sm font-medium text-slate-100">{name}</h4>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 truncate font-mono text-xs text-slate-400">{url}</p>

      <div className="mt-4 space-y-2">
        <MetaRow label="API key">{apiKey}</MetaRow>
        {indexerCount !== null && <MetaRow label="Indexers">{indexerCount}</MetaRow>}
        {onConfigureDefaults && (
          <MetaRow label="Default sources">
            {defaultSourceCount > 0 ? defaultSourceCount : 'None'}
          </MetaRow>
        )}
      </div>

      <CardActions onTest={onTest} onEdit={onEdit} onDelete={onDelete} isTesting={isTesting}>
        {onConfigureDefaults && (
          <button
            onClick={onConfigureDefaults}
            title="Choose which indexers are searched by default"
            aria-label="Default sources"
            className={iconButton}
          >
            <Star
              className={cn('h-4 w-4', defaultSourceCount > 0 && 'fill-amber-400 text-amber-400')}
            />
          </button>
        )}
      </CardActions>
    </div>
  )
}

const clientTypeLabels: Record<ClientType, string> = {
  qbittorrent: 'qBittorrent',
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
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="truncate text-sm font-medium text-slate-100">{name}</h4>
          {isDefault && (
            <span
              className="tag tag-warn"
              title="Torrents send here automatically when no client is picked"
            >
              <Star className="h-3 w-3 fill-amber-400" />
              Default
            </span>
          )}
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 truncate font-mono text-xs text-slate-400">{url}</p>

      <div className="mt-4 space-y-2">
        <MetaRow label="Type">{clientTypeLabels[clientType] ?? clientType}</MetaRow>
      </div>

      <CardActions onTest={onTest} onEdit={onEdit} onDelete={onDelete} isTesting={isTesting} />
    </div>
  )
}
