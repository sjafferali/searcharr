export type SearchCategory =
  | 'All'
  | 'Movies'
  | 'TV'
  | 'Music'
  | 'Software'
  | 'Games'
  | 'Books'
  | 'Anime'
  | 'Other'

export type SortBy = 'seeders' | 'size' | 'date' | 'name'
export type SortOrder = 'asc' | 'desc'
export type SourceType = 'jackett' | 'prowlarr'

export interface SearchResult {
  id: string
  title: string
  source: string
  source_type: SourceType
  indexer: string
  size: number
  size_formatted: string
  seeders: number
  leechers: number
  date: string | null
  category: string
  magnet_link: string | null
  torrent_url: string | null
  info_url: string | null
}

export interface SearchResponse {
  query: string
  category: SearchCategory
  total_results: number
  results: SearchResult[]
  sources_queried: number
  errors: string[]
}

export interface SearchParams {
  q: string
  category?: SearchCategory
  jackett_ids?: number[]
  prowlarr_ids?: number[]
  exclusive_filter?: boolean
  min_seeders?: number
  max_size?: string
  sort_by?: SortBy
  sort_order?: SortOrder
}

export interface CategoriesResponse {
  categories: SearchCategory[]
}
