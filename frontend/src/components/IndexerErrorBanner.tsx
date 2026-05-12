import { AlertTriangle } from 'lucide-react'
import { IndexerError } from '../types'
import { cn } from '../utils'

interface IndexerErrorBannerProps {
  errors: IndexerError[]
  /** Optional lead-in shown before the list. Defaults to a search-flavored line. */
  title?: string
  className?: string
}

/** Build the "<source> › <indexer>" prefix for one error, omitting empty parts. */
function errorLabel(err: IndexerError): string {
  const parts: string[] = []
  if (err.source) parts.push(err.source)
  if (err.indexer) parts.push(err.indexer)
  return parts.join(' › ')
}

/**
 * A dismissable-looking warning panel that lists indexers / instances that
 * failed during a search or feed poll (rate limits, disabled indexers,
 * timeouts, ...). Renders nothing when there are no errors.
 */
export function IndexerErrorBanner({
  errors,
  title = 'Some indexers returned an error and were skipped:',
  className,
}: IndexerErrorBannerProps) {
  if (!errors || errors.length === 0) return null

  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-200">{title}</p>
          <ul className="mt-1.5 space-y-1">
            {errors.map((err, idx) => {
              const label = errorLabel(err)
              return (
                <li key={`${label}-${idx}`} className="text-amber-100/90 [overflow-wrap:anywhere]">
                  {label && <span className="font-medium text-amber-200">{label}</span>}
                  {label && <span className="text-amber-300/70"> — </span>}
                  <span>{err.message}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
