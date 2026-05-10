import api from './axios'
import {
  Bookmark,
  BookmarkCreate,
  BookmarkListParams,
  BookmarkListResponse,
  BookmarkLookupItem,
  BookmarkLookupResponse,
} from '../types'

export const bookmarksApi = {
  list: async (params: BookmarkListParams = {}): Promise<BookmarkListResponse> => {
    const queryParams = new URLSearchParams()
    if (params.sort_by) queryParams.append('sort_by', params.sort_by)
    if (params.sort_order) queryParams.append('sort_order', params.sort_order)
    const qs = queryParams.toString()
    const response = await api.get<BookmarkListResponse>(`/bookmarks${qs ? `?${qs}` : ''}`)
    return response.data
  },

  create: async (payload: BookmarkCreate): Promise<Bookmark> => {
    const response = await api.post<Bookmark>('/bookmarks', payload)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/bookmarks/${id}`)
  },

  deleteByKey: async (dedupKey: string): Promise<void> => {
    await api.delete(`/bookmarks/by-key/${encodeURIComponent(dedupKey)}`)
  },

  lookup: async (items: BookmarkLookupItem[]): Promise<BookmarkLookupResponse> => {
    const response = await api.post<BookmarkLookupResponse>('/bookmarks/lookup', { items })
    return response.data
  },
}
