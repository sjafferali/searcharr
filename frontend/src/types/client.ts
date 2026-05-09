import { Status } from './common'

export type ClientType = 'qbittorrent'

export interface DownloadClient {
  id: number
  name: string
  client_type: ClientType
  url: string
  category: string | null
  is_default: boolean
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
  is_default?: boolean
}

export interface UpdateDownloadClient {
  name?: string
  client_type?: ClientType
  url?: string
  username?: string
  password?: string
  category?: string | null
  is_default?: boolean
}

export interface DownloadRequest {
  client_id: number
  magnet_link?: string
  torrent_url?: string
  title: string
  size_bytes?: number | null
  info_url?: string | null
  source_type: 'jackett' | 'prowlarr'
  source_instance_id?: number | null
  source_instance_name: string
  indexer: string
  search_query?: string | null
}

export interface DownloadResponse {
  success: boolean
  message: string
  client_name: string
}
