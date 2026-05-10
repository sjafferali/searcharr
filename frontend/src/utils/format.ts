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
 * Format a date as a compact age, picking the unit by Prowlarr's bucketing
 * (mirrors ``frontend/src/Utilities/Number/formatAge.js`` in the Prowlarr
 * codebase) but rendering compact suffixes instead of full words:
 *
 *   under 2 hours  →  ``"45m"`` (whole minutes)
 *   2–48 hours     →  ``"3.4h"`` (one decimal)
 *   48 hours+      →  ``"5d"`` (whole days)
 *
 * When the source date is *in the future* (the indexer's clock or its
 * Cardigann timezone parser is wrong — common for some private trackers
 * whose YAMLs misinterpret the site's local time), the same buckets apply
 * but the result is prefixed with ``"+"`` so the discrepancy is visible
 * (e.g. ``"+9.0h"``). Skews under 1 minute either direction collapse to
 * ``"0m"`` because that's just clock noise.
 */
export function formatAge(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'
  const diffMs = Date.now() - date.getTime()
  if (Math.abs(diffMs) < 60_000) return '0m'

  const future = diffMs < 0
  const abs = Math.abs(diffMs)
  const days = Math.floor(abs / 86400000)
  let label: string
  if (days < 2) {
    const hours = abs / 3600000
    if (hours < 2) {
      label = `${Math.round(abs / 60000)}m`
    } else {
      label = `${hours.toFixed(1)}h`
    }
  } else {
    label = `${days}d`
  }
  return future ? `+${label}` : label
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
 * Parse a size string like "10GB" or "500MB" into bytes. Returns null on bad input.
 */
export function parseSize(input: string): number | null {
  const match = input
    .trim()
    .toUpperCase()
    .match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B?)$/)
  if (!match) return null
  const value = parseFloat(match[1])
  const unit = match[2] || 'B'
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    K: 1024,
    MB: 1024 ** 2,
    M: 1024 ** 2,
    GB: 1024 ** 3,
    G: 1024 ** 3,
    TB: 1024 ** 4,
    T: 1024 ** 4,
  }
  const multiplier = multipliers[unit] ?? 1
  return Math.round(value * multiplier)
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
