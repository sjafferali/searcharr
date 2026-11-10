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
        'inline-flex items-center gap-2 text-xs',
        status === 'online' ? 'text-slate-300' : 'text-red-400',
        className,
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          status === 'online' ? 'bg-emerald-400' : 'bg-red-400',
        )}
      />
      {status}
    </span>
  )
}
