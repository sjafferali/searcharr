import { Status } from './common'

export type ClientType = 'qbittorrent'

export interface DownloadClient {
  id: number
  name: string
  client_type: ClientType
  url: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface DownloadClientWithStatus extends DownloadClient {
  status: Status
}

export interface CreateDownloadClient {
  name: string
  client_type: ClientType
  url: string
  username: string
  password: string
  category?: string | null
}

export interface UpdateDownloadClient {
  name?: string
  client_type?: ClientType
  url?: string
  username?: string
  password?: string
  category?: string | null
}

export interface DownloadRequest {
  client_id: number
  magnet_link?: string
  torrent_url?: string
}

export interface DownloadResponse {
  success: boolean
  message: string
  client_name: string
}
