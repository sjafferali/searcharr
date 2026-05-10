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

    if (params.jackett_indexers && params.jackett_indexers.length > 0) {
      params.jackett_indexers.forEach((value) => queryParams.append('jackett_indexers', value))
    }

    if (params.prowlarr_indexers && params.prowlarr_indexers.length > 0) {
      params.prowlarr_indexers.forEach((value) => queryParams.append('prowlarr_indexers', value))
    }

    if (params.exclusive_filter) {
      queryParams.append('exclusive_filter', 'true')
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
