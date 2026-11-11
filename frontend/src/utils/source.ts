/**
 * Tag classes for a result's source, so Jackett and Prowlarr results are
 * distinguishable at a glance in every list (amber vs cyan).
 */
export function sourceTagClass(sourceType: string | null | undefined): string {
  return sourceType === 'jackett' ? 'tag tag-jackett' : 'tag tag-prowlarr'
}

export function sourceLabel(sourceType: string | null | undefined): string {
  return sourceType === 'jackett' ? 'Jackett' : 'Prowlarr'
}
