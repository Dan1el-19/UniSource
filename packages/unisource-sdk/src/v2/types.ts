export type SortBy = 'created_at' | 'updated_at' | 'name' | 'size'
export type SortDir = 'asc' | 'desc'
export type TrashFilter = 'active' | 'trashed' | 'all'

export interface V2ListQuery {
  folder_id?: string | null
  search?: string
  mime_type?: string
  trash?: TrashFilter
  sort_by?: SortBy
  sort_dir?: SortDir
  cursor?: string
  limit?: number
}

export interface V2Page {
  limit: number
  next_cursor: string | null
}

export interface V2ListResponse<T> {
  items: T[]
  page: V2Page
}

export interface V2ErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
    request_id: string
  }
}
