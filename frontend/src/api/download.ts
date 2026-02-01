import api from './axios'
import { DownloadRequest, DownloadResponse } from '../types'

export const downloadApi = {
  sendToClient: async (request: DownloadRequest): Promise<DownloadResponse> => {
    const response = await api.post<DownloadResponse>('/download', request)
    return response.data
  },
}
