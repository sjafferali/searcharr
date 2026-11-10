import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, Download, XCircle, CheckCircle2 } from 'lucide-react'
import { HistoryMatch, HistoryMatchEntry } from '../types'
import { cn, formatDateTime, formatRelative } from '../utils'

interface DownloadedBadgeProps {
  match: HistoryMatch
}

const POPOVER_WIDTH = 288 // Tailwind w-72
const POPOVER_GAP = 8

function ActionIcon({ entry }: { entry: HistoryMatchEntry }) {
  if (entry.status === 'failed') {
    return <XCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-red-400" />
  }
  if (entry.action === 'sent_to_client') {
    return <Send className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
  }
  return <Download className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" />
}

function actionLabel(entry: HistoryMatchEntry): string {
  if (entry.status === 'failed') return 'Failed send'
  if (entry.action === 'sent_to_client') {
    return entry.client_name ? `Sent to ${entry.client_name}` : 'Sent to client'
  }
  return 'Downloaded .torrent'
}

export function DownloadedBadge({ match }: DownloadedBadgeProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const lastEntry = match.entries[0]
  const lastWasFailure = lastEntry?.status === 'failed'

  const updatePosition = () => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    let left = rect.left
    if (left + POPOVER_WIDTH > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - POPOVER_WIDTH - 8)
    }
    setCoords({ top: rect.bottom + POPOVER_GAP, left })
  }

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = () => updatePosition()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  return (
    <>
      <span
        ref={anchorRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        className={cn(
          'tag cursor-help transition-colors',
          lastWasFailure ? 'tag-bad' : 'text-slate-300 hover:border-slate-600',
        )}
      >
        {lastWasFailure ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        Downloaded
        {match.count > 1 && <span className="text-slate-500">·{match.count}</span>}
      </span>

      {open &&
        coords &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 animate-fade-in"
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
          >
            <div className="popover-shadow overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
                <span className="text-xs font-medium text-slate-200">Previously downloaded</span>
                <span className="ml-auto font-mono text-2xs text-slate-500">{match.count}</span>
              </div>
              <ul className="max-h-72 divide-y divide-slate-800 overflow-y-auto">
                {match.entries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 px-3 py-2">
                    <ActionIcon entry={entry} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs text-slate-200">{actionLabel(entry)}</span>
                      <span className="font-mono text-2xs text-slate-500">
                        {formatRelative(entry.occurred_at)}
                        <span className="ml-2 text-slate-600">
                          {formatDateTime(entry.occurred_at)}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
