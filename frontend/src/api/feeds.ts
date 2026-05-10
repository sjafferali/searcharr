import api from './axios'
import { Feed, FeedCreate, FeedFetchResponse, FeedListResponse, FeedUpdate } from '../types'

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
}
