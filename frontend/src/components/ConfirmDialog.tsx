import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { LoadingSpinner } from './LoadingSpinner'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      titleIcon={<AlertTriangle className="h-4 w-4 text-red-400" />}
      size="sm"
      footer={
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && <LoadingSpinner size="sm" className="text-white" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-300">{message}</p>
    </Modal>
  )
}
