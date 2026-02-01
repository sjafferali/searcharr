import { Status } from './common'

// Jackett Instance Types
export interface JackettInstance {
  id: number
  name: string
  url: string
  api_key: string // Masked
  created_at: string
  updated_at: string
}

export interface JackettInstanceWithStatus extends JackettInstance {
  status: Status
  indexer_count: number | null
}

export interface CreateJackettInstance {
  name: string
  url: string
  api_key: string
}

export interface UpdateJackettInstance {
  name?: string
  url?: string
  api_key?: string
}

// Prowlarr Instance Types
export interface ProwlarrInstance {
  id: number
  name: string
  url: string
  api_key: string // Masked
  created_at: string
  updated_at: string
}

export interface ProwlarrInstanceWithStatus extends ProwlarrInstance {
  status: Status
  indexer_count: number | null
}

export interface CreateProwlarrInstance {
  name: string
  url: string
  api_key: string
}

export interface UpdateProwlarrInstance {
  name?: string
  url?: string
  api_key?: string
}

// Combined status response
export interface AllInstancesStatus {
  jackett: JackettInstanceWithStatus[]
  prowlarr: ProwlarrInstanceWithStatus[]
  total_online: number
}

// Generic instance type for shared components
export type InstanceType = 'jackett' | 'prowlarr'

export interface Instance {
  id: number
  name: string
  url: string
  api_key: string
  created_at: string
  updated_at: string
}

export interface InstanceWithStatus extends Instance {
  status: Status
  indexer_count: number | null
  type: InstanceType
}
