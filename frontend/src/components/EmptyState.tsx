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
        'flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-3 text-slate-600">{icon}</div>
      <p className="text-sm text-slate-200">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
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
