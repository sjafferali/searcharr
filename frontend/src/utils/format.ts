/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format date to readable string
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return '-'

  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date as an age in whole days (e.g. "500 Days").
 */
export function formatAge(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  const diffMs = Date.now() - date.getTime()
  const days = Math.max(0, Math.floor(diffMs / 86400000))
  return `${days} ${days === 1 ? 'Day' : 'Days'}`
}

/**
 * Format a date as a relative time string (e.g. "3 minutes ago", "yesterday").
 */
export function formatRelative(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const absSec = Math.abs(diffSec)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (absSec < 60) return rtf.format(diffSec, 'second')
  if (absSec < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (absSec < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (absSec < 604800) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (absSec < 2629800) return rtf.format(Math.round(diffSec / 604800), 'week')
  if (absSec < 31557600) return rtf.format(Math.round(diffSec / 2629800), 'month')
  return rtf.format(Math.round(diffSec / 31557600), 'year')
}

/**
 * Format a date as an absolute timestamp (e.g. "May 9, 2026, 3:42 PM").
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Mask sensitive strings (API keys, passwords)
 */
export function maskString(str: string, visibleChars = 4): string {
  if (str.length <= visibleChars * 2) {
    return '•'.repeat(str.length)
  }
  return `${str.slice(0, visibleChars)}...${str.slice(-visibleChars)}`
}
