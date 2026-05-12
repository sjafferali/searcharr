import { IndexerError, SearchCategory, SearchResult, SortOrder, SourceType } from './search'

export interface FeedIndexerRef {
  source_type: SourceType
  source_instance_id: number
  source_instance_name: string
  indexer_id: string
  indexer_name: string
}

export type FeedSortStrategy = 'date_desc' | 'indexer_order'

export interface FeedFilters {
  category: SearchCategory
  freeleech_only: boolean
  min_seeders: number
  min_size_bytes: number | null
  max_size_bytes: number | null
  include_regex: string | null
  exclude_regex: string | null
}

export interface Feed {
  id: number
  name: string
  description: string | null
  sort_strategy: FeedSortStrategy
  filters: FeedFilters
  indexers: FeedIndexerRef[]
  poll_interval_minutes: number
  retention_days: number
  polling_enabled: boolean
  last_polled_at: string | null
  last_poll_errors: IndexerError[]
  stale_after_seconds: number
  created_at: string
  updated_at: string
}

export interface FeedListResponse {
  total: number
  entries: Feed[]
}

export interface FeedCreate {
  name: string
  description?: string | null
  sort_strategy?: FeedSortStrategy
  filters?: FeedFilters
  poll_interval_minutes?: number
  retention_days?: number
  polling_enabled?: boolean
  indexers: FeedIndexerRef[]
}

export interface FeedUpdate {
  name?: string
  description?: string | null
  sort_strategy?: FeedSortStrategy
  filters?: FeedFilters
  poll_interval_minutes?: number
  retention_days?: number
  polling_enabled?: boolean
  indexers?: FeedIndexerRef[]
}

export interface FeedFetchResponse {
  feed_id: number
  feed_name: string
  fetched_at: string
  total_results: number
  results: SearchResult[]
  sources_queried: number
  errors: IndexerError[]
}

export type FeedItemSortBy = 'last_seen' | 'first_seen' | 'pub_date' | 'seeders' | 'size' | 'title'

export interface FeedItem extends SearchResult {
  item_id: number
  first_seen_at: string
  last_seen_at: string
  dedup_key: string
}

export interface FeedItemListParams {
  limit?: number
  offset?: number
  sort_by?: FeedItemSortBy
  sort_order?: SortOrder
  freeleech_only?: boolean
  min_seeders?: number
  min_size_bytes?: number
  max_size_bytes?: number
  seen_within_hours?: number
  first_seen_within_hours?: number
}

export interface FeedItemListResponse {
  total: number
  entries: FeedItem[]
  feed_id: number
  feed_name: string
  last_polled_at: string | null
  next_poll_at: string | null
  stale_after_seconds: number
  polling_enabled: boolean
  source_errors: IndexerError[]
}
