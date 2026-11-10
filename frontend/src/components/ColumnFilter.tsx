import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Filter, X } from 'lucide-react'
import { cn } from '../utils'

interface ColumnFilterProps {
  label: string
  isActive: boolean
  panel: (close: () => void) => ReactNode
  onClear: () => void
  panelWidthClass?: string
}

export function ColumnFilter({
  label,
  isActive,
  panel,
  onClear,
  panelWidthClass = 'w-56',
}: ColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
          isActive
            ? 'text-cyan-300 opacity-100 hover:bg-slate-800'
            : 'text-slate-500 opacity-0 hover:text-slate-200 group-hover/cell:opacity-100',
          open && 'bg-slate-800 text-slate-200 opacity-100',
        )}
        title={isActive ? `${label} (active — click to edit)` : label}
        aria-label={label}
      >
        <Filter className={cn('h-3 w-3', isActive && 'fill-current')} />
      </button>
      {open && (
        <div
          className={cn(
            'popover-shadow absolute right-0 top-full z-20 mt-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left',
            panelWidthClass,
          )}
          role="dialog"
        >
          {panel(() => setOpen(false))}
          {isActive && (
            <button
              type="button"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
              className="btn-secondary mt-3 flex h-8 w-full items-center justify-center gap-2 px-3 text-xs"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  )
}
