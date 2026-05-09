import api from './axios'
import {
  HistoryEntry,
  HistoryEntryCreate,
  HistoryListParams,
  HistoryListResponse,
  HistoryLookupItem,
  HistoryLookupResponse,
} from '../types'

export const historyApi = {
  list: async (params: HistoryListParams = {}): Promise<HistoryListResponse> => {
    const queryParams = new URLSearchParams()

    if (params.q) queryParams.append('q', params.q)
    if (params.action) queryParams.append('action', params.action)
    if (params.source_type) queryParams.append('source_type', params.source_type)
    if (params.source_instance_id !== undefined)
      queryParams.append('source_instance_id', params.source_instance_id.toString())
    if (params.indexer) queryParams.append('indexer', params.indexer)
    if (params.client_id !== undefined) queryParams.append('client_id', params.client_id.toString())
    if (params.status) queryParams.append('status', params.status)
    if (params.since) queryParams.append('since', params.since)
    if (params.until) queryParams.append('until', params.until)
    if (params.sort_by) queryParams.append('sort_by', params.sort_by)
    if (params.sort_order) queryParams.append('sort_order', params.sort_order)
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString())
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString())

    const qs = queryParams.toString()
    const response = await api.get<HistoryListResponse>(`/history${qs ? `?${qs}` : ''}`)
    return response.data
  },

  create: async (entry: HistoryEntryCreate): Promise<HistoryEntry> => {
    const response = await api.post<HistoryEntry>('/history', entry)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/history/${id}`)
  },

  lookup: async (items: HistoryLookupItem[]): Promise<HistoryLookupResponse> => {
    const response = await api.post<HistoryLookupResponse>('/history/lookup', { items })
    return response.data
  },
}
