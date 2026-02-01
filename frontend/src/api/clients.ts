import api from './axios'
import {
  DownloadClient,
  DownloadClientWithStatus,
  CreateDownloadClient,
  UpdateDownloadClient,
  TestConnectionResponse,
} from '../types'

export const clientsApi = {
  list: async (): Promise<DownloadClient[]> => {
    const response = await api.get<DownloadClient[]>('/clients')
    return response.data
  },

  get: async (id: number): Promise<DownloadClient> => {
    const response = await api.get<DownloadClient>(`/clients/${id}`)
    return response.data
  },

  create: async (data: CreateDownloadClient): Promise<DownloadClient> => {
    const response = await api.post<DownloadClient>('/clients', data)
    return response.data
  },

  update: async (id: number, data: UpdateDownloadClient): Promise<DownloadClient> => {
    const response = await api.put<DownloadClient>(`/clients/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/clients/${id}`)
  },

  test: async (id: number): Promise<TestConnectionResponse> => {
    const response = await api.post<TestConnectionResponse>(`/clients/${id}/test`)
    return response.data
  },

  listWithStatus: async (): Promise<DownloadClientWithStatus[]> => {
    const response = await api.get<DownloadClientWithStatus[]>('/clients/status/all')
    return response.data
  },
}
