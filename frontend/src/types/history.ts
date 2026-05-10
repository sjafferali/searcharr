import { SourceType } from './search'

export type HistoryAction = 'sent_to_client' | 'downloaded_torrent'
export type HistoryStatus = 'success' | 'failed'
export type HistorySortBy = 'occurred_at' | 'title' | 'size_bytes'
export type SortOrder = 'asc' | 'desc'

export interface HistoryEntry {
  id: number
  occurred_at: string
  action: HistoryAction
  status: HistoryStatus
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
  client_id: number | null
  client_name: string | null
  search_query: string | null
  error_message: string | null
}

export interface HistoryListResponse {
  total: number
  limit: number
  offset: number
  entries: HistoryEntry[]
}

export interface HistoryListParams {
  q?: string
  action?: HistoryAction
  source_type?: SourceType
  source_instance_id?: number
  indexer?: string
  client_id?: number
  status?: HistoryStatus
  since?: string
  until?: string
  min_size_bytes?: number
  max_size_bytes?: number
  sort_by?: HistorySortBy
  sort_order?: SortOrder
  limit?: number
  offset?: number
}

export interface HistoryEntryCreate {
  title: string
  size_bytes?: number | null
  info_url?: string | null
  torrent_url?: string | null
  magnet_link?: string | null
  source_type: SourceType
  source_instance_id?: number | null
  source_instance_name: string
  indexer: string
  search_query?: string | null
}

export interface HistoryLookupItem {
  title: string
  size_bytes?: number | null
  info_url?: string | null
}

export interface HistoryMatchEntry {
  id: number
  occurred_at: string
  action: HistoryAction
  status: HistoryStatus
  client_name: string | null
}

export interface HistoryMatch {
  index: number
  count: number
  last_occurred_at: string
  entries: HistoryMatchEntry[]
}

export interface HistoryLookupResponse {
  matches: HistoryMatch[]
}
