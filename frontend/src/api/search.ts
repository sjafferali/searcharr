import api from './axios'
import { SearchParams, SearchResponse, CategoriesResponse } from '../types'

export const searchApi = {
  search: async (params: SearchParams): Promise<SearchResponse> => {
    // Build query parameters
    const queryParams = new URLSearchParams()

    queryParams.append('q', params.q)

    if (params.category && params.category !== 'All') {
      queryParams.append('category', params.category)
    }

    if (params.jackett_ids && params.jackett_ids.length > 0) {
      params.jackett_ids.forEach((id) => queryParams.append('jackett_ids', id.toString()))
    }

    if (params.prowlarr_ids && params.prowlarr_ids.length > 0) {
      params.prowlarr_ids.forEach((id) => queryParams.append('prowlarr_ids', id.toString()))
    }

    if (params.exclusive_filter) {
      queryParams.append('exclusive_filter', 'true')
    }

    if (params.min_seeders !== undefined && params.min_seeders > 0) {
      queryParams.append('min_seeders', params.min_seeders.toString())
    }

    if (params.max_size) {
      queryParams.append('max_size', params.max_size)
    }

    if (params.sort_by) {
      queryParams.append('sort_by', params.sort_by)
    }

    if (params.sort_order) {
      queryParams.append('sort_order', params.sort_order)
    }

    const response = await api.get<SearchResponse>(`/search?${queryParams.toString()}`)
    return response.data
  },

  getCategories: async (): Promise<CategoriesResponse> => {
    const response = await api.get<CategoriesResponse>('/search/categories')
    return response.data
  },
}
