import { SourceType, SortOrder } from './search'

export type BookmarkSortBy = 'created_at' | 'title' | 'size_bytes'

export interface Bookmark {
  id: number
  created_at: string
  title: string
  size_bytes: number | null
  size_formatted: string
  info_url: string | null
  torrent_url: string | null
  magnet_link: string | null
  source_type: SourceType
  source_instance_id: number | null
  source_instance_name: string
  indexer: string
  category: string | null
  notes: string | null
  dedup_key: string
}

export interface BookmarkListResponse {
  total: number
  entries: Bookmark[]
}

export interface BookmarkCreate {
  title: string
  size_bytes?: number | null
  info_url?: string | null
  torrent_url?: string | null
  magnet_link?: string | null
  source_type: SourceType
  source_instance_id?: number | null
  source_instance_name: string
  indexer: string
  category?: string | null
  notes?: string | null
}

export interface BookmarkLookupItem {
  info_url?: string | null
  torrent_url?: string | null
  magnet_link?: string | null
}

export interface BookmarkLookupRequest {
  items: BookmarkLookupItem[]
}

export interface BookmarkLookupResponse {
  matches: Record<string, number>
}

export interface BookmarkListParams {
  sort_by?: BookmarkSortBy
  sort_order?: SortOrder
}
