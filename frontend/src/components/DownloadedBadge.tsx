import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, Download, XCircle, CheckCircle2, History } from 'lucide-react'
import { HistoryMatch, HistoryMatchEntry } from '../types'
import { cn, formatDateTime, formatRelative } from '../utils'

interface DownloadedBadgeProps {
  match: HistoryMatch
}

const POPOVER_WIDTH = 288 // Tailwind w-72
const POPOVER_GAP = 8

function ActionIcon({ entry }: { entry: HistoryMatchEntry }) {
  if (entry.status === 'failed') {
    return <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
  }
  if (entry.action === 'sent_to_client') {
    return <Send className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
  }
  return <Download className="h-3.5 w-3.5 flex-shrink-0 text-violet-400" />
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
          'inline-flex flex-shrink-0 cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/50',
          lastWasFailure
            ? 'border-red-400/30 bg-red-500/10 text-red-300 hover:border-red-400/50'
            : 'border-violet-400/30 bg-violet-500/10 text-violet-300 hover:border-violet-400/50',
        )}
      >
        {lastWasFailure ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
        Downloaded
        {match.count > 1 && <span className="text-violet-400/80">·{match.count}</span>}
      </span>

      {open &&
        coords &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 animate-fade-in"
            style={{ top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
          >
            <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/95 shadow-xl shadow-black/40 backdrop-blur">
              <div className="flex items-center gap-2 border-b border-slate-700/60 bg-slate-800/60 px-3 py-2">
                <History className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Previously downloaded
                </span>
                <span className="ml-auto rounded-full bg-slate-700/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                  {match.count}
                </span>
              </div>
              <ul className="max-h-72 divide-y divide-slate-800/70 overflow-y-auto">
                {match.entries.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 px-3 py-2">
                    <ActionIcon entry={entry} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[11px] font-medium text-slate-200">
                        {actionLabel(entry)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {formatRelative(entry.occurred_at)}
                        <span className="ml-1.5 text-slate-600">
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
