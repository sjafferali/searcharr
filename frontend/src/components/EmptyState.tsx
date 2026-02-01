import { ReactNode } from 'react'
import { cn } from '../utils'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 py-12',
        className,
      )}
    >
      <div className="mb-3 text-slate-600">{icon}</div>
      <p className="text-sm text-slate-400">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-sm font-medium text-cyan-400 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
