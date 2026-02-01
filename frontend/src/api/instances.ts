import api from './axios'
import {
  JackettInstance,
  CreateJackettInstance,
  UpdateJackettInstance,
  ProwlarrInstance,
  CreateProwlarrInstance,
  UpdateProwlarrInstance,
  AllInstancesStatus,
  TestConnectionResponse,
} from '../types'

// Jackett Instance API
export const jackettApi = {
  list: async (): Promise<JackettInstance[]> => {
    const response = await api.get<JackettInstance[]>('/instances/jackett')
    return response.data
  },

  get: async (id: number): Promise<JackettInstance> => {
    const response = await api.get<JackettInstance>(`/instances/jackett/${id}`)
    return response.data
  },

  create: async (data: CreateJackettInstance): Promise<JackettInstance> => {
    const response = await api.post<JackettInstance>('/instances/jackett', data)
    return response.data
  },

  update: async (id: number, data: UpdateJackettInstance): Promise<JackettInstance> => {
    const response = await api.put<JackettInstance>(`/instances/jackett/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/instances/jackett/${id}`)
  },

  test: async (id: number): Promise<TestConnectionResponse> => {
    const response = await api.post<TestConnectionResponse>(`/instances/jackett/${id}/test`)
    return response.data
  },
}

// Prowlarr Instance API
export const prowlarrApi = {
  list: async (): Promise<ProwlarrInstance[]> => {
    const response = await api.get<ProwlarrInstance[]>('/instances/prowlarr')
    return response.data
  },

  get: async (id: number): Promise<ProwlarrInstance> => {
    const response = await api.get<ProwlarrInstance>(`/instances/prowlarr/${id}`)
    return response.data
  },

  create: async (data: CreateProwlarrInstance): Promise<ProwlarrInstance> => {
    const response = await api.post<ProwlarrInstance>('/instances/prowlarr', data)
    return response.data
  },

  update: async (id: number, data: UpdateProwlarrInstance): Promise<ProwlarrInstance> => {
    const response = await api.put<ProwlarrInstance>(`/instances/prowlarr/${id}`, data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/instances/prowlarr/${id}`)
  },

  test: async (id: number): Promise<TestConnectionResponse> => {
    const response = await api.post<TestConnectionResponse>(`/instances/prowlarr/${id}/test`)
    return response.data
  },
}

// Get all instances with status
export const getInstancesStatus = async (): Promise<AllInstancesStatus> => {
  const response = await api.get<AllInstancesStatus>('/instances/status')
  return response.data
}
