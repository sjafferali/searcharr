import api from './axios'
import {
  Feed,
  FeedCreate,
  FeedFetchResponse,
  FeedItemListParams,
  FeedItemListResponse,
  FeedListResponse,
  FeedUpdate,
} from '../types'

function buildItemQuery(params: FeedItemListParams): string {
  const qs = new URLSearchParams()
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  if (params.sort_by !== undefined) qs.set('sort_by', params.sort_by)
  if (params.sort_order !== undefined) qs.set('sort_order', params.sort_order)
  if (params.freeleech_only !== undefined && params.freeleech_only) {
    qs.set('freeleech_only', 'true')
  }
  if (params.min_seeders !== undefined && params.min_seeders > 0) {
    qs.set('min_seeders', String(params.min_seeders))
  }
  if (params.min_size_bytes !== undefined && params.min_size_bytes !== null) {
    qs.set('min_size_bytes', String(params.min_size_bytes))
  }
  if (params.max_size_bytes !== undefined && params.max_size_bytes !== null) {
    qs.set('max_size_bytes', String(params.max_size_bytes))
  }
  if (params.seen_within_hours !== undefined && params.seen_within_hours !== null) {
    qs.set('seen_within_hours', String(params.seen_within_hours))
  }
  if (params.first_seen_within_hours !== undefined && params.first_seen_within_hours !== null) {
    qs.set('first_seen_within_hours', String(params.first_seen_within_hours))
  }
  if (params.first_seen_after !== undefined && params.first_seen_after !== null) {
    qs.set('first_seen_after', params.first_seen_after)
  }
  return qs.toString()
}

export const feedsApi = {
  list: async (): Promise<FeedListResponse> => {
    const response = await api.get<FeedListResponse>('/feeds')
    return response.data
  },

  get: async (id: number): Promise<Feed> => {
    const response = await api.get<Feed>(`/feeds/${id}`)
    return response.data
  },

  create: async (payload: FeedCreate): Promise<Feed> => {
    const response = await api.post<Feed>('/feeds', payload)
    return response.data
  },

  update: async (id: number, payload: FeedUpdate): Promise<Feed> => {
    const response = await api.put<Feed>(`/feeds/${id}`, payload)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/feeds/${id}`)
  },

  fetch: async (id: number): Promise<FeedFetchResponse> => {
    const response = await api.post<FeedFetchResponse>(`/feeds/${id}/fetch`)
    return response.data
  },

  items: async (id: number, params: FeedItemListParams = {}): Promise<FeedItemListResponse> => {
    const qs = buildItemQuery(params)
    const url = qs ? `/feeds/${id}/items?${qs}` : `/feeds/${id}/items`
    const response = await api.get<FeedItemListResponse>(url)
    return response.data
  },

  refresh: async (id: number): Promise<FeedItemListResponse> => {
    const response = await api.post<FeedItemListResponse>(`/feeds/${id}/refresh`)
    return response.data
  },
}
