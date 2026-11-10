import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  titleIcon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleIcon,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full rounded-2xl border border-slate-700 bg-slate-900 shadow-[0_8px_24px_rgba(0,0,0,0.3)]',
          sizeClasses[size],
        )}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 p-4">
          <h3 className="flex items-center gap-2 text-base font-medium text-slate-100">
            {titleIcon}
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">{children}</div>

        {/* Footer */}
        {footer && <div className="rounded-b-2xl border-t border-slate-700 p-4">{footer}</div>}
      </div>
    </div>
  )
}
