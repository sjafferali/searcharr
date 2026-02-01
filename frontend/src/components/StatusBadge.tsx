import { cn } from '../utils'
import { Status } from '../types'

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
        status === 'online'
          ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
          : 'border border-red-500/30 bg-red-500/20 text-red-400',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'online' ? 'animate-pulse bg-emerald-400' : 'bg-red-400',
        )}
      />
      {status}
    </span>
  )
}
