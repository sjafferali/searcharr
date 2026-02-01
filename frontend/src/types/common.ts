// Common types used across the application

export type Status = 'online' | 'offline'

export interface TestConnectionResponse {
  success: boolean
  message: string
  indexer_count: number | null
}

export interface ApiError {
  detail: string | ValidationError[]
}

export interface ValidationError {
  type: string
  loc: (string | number)[]
  msg: string
  input: unknown
  ctx?: Record<string, unknown>
}
