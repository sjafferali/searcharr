import { SearchCategory, SearchResult, SourceType } from './search'

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
  indexers: FeedIndexerRef[]
}

export interface FeedUpdate {
  name?: string
  description?: string | null
  sort_strategy?: FeedSortStrategy
  filters?: FeedFilters
  indexers?: FeedIndexerRef[]
}

export interface FeedFetchResponse {
  feed_id: number
  feed_name: string
  fetched_at: string
  total_results: number
  results: SearchResult[]
  sources_queried: number
  errors: string[]
}
