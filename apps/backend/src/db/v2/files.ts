import type { D1Database } from '@cloudflare/workers-types'
import { buildKeysetWhere } from '../../lib/v2/pagination'
import type { SortDir } from '../../lib/v2/pagination'
import { decodeCursor, encodeCursor, fingerprint } from '../../lib/v2/cursor'
import { RESOURCE_CONFIG_FILES, type FilesSortBy, type FilesFilterSet } from '../../lib/v2/resource'
import type { UploadDestination } from '../v1/files'

export interface FileRowV2 {
  id: string
  service_id: string
  user_id: string
  folder_id: string | null
  upload_id: string | null
  filename: string
  size: number
  mime_type: string
  storage_destination: UploadDestination
  is_trashed: boolean
  trashed_at: number | null
  created_at: number
  updated_at: number
}

// Internal row coming back from D1. `storage_key` and `bucket` are selected so
// the routing layer can decide where to send the user, but they must NOT be
// echoed in the v2 list response — `mapFile` strips them.
interface RawFileRow {
  id: string
  service_id: string
  user_id: string
  folder_id: string | null
  upload_id: string | null
  filename: string
  size: number
  mime_type: string
  storage_destination: UploadDestination
  storage_key: string
  bucket: string
  is_trashed: 0 | 1
  trashed_at: number | null
  created_at: number
  updated_at: number
}

export interface ListFilesV2Input {
  user_id: string
  service_id: string
  folder_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search?: string
  mime_type?: string
  sort_by: FilesSortBy
  sort_dir: SortDir
  limit: number
  cursor?: string
  /** Secret used for cursor HMAC (env.CURSOR_HMAC_SECRET). */
  hmacSecret: string
}

export interface ListFilesV2Result {
  items: FileRowV2[]
  next_cursor: string | null
}

const SELECT_COLUMNS = [
  'id',
  'service_id',
  'user_id',
  'folder_id',
  'upload_id',
  'filename',
  'size',
  'mime_type',
  'storage_destination',
  'storage_key',
  'bucket',
  'is_trashed',
  'trashed_at',
  'created_at',
  'updated_at',
].join(', ')

function mapFile(row: RawFileRow): FileRowV2 {
  // Drop storage_key/bucket — internal-only — and normalise is_trashed.
  const { storage_key: _sk, bucket: _b, is_trashed, ...rest } = row
  return { ...rest, is_trashed: is_trashed === 1 }
}

function lastValue(row: RawFileRow, sort_by: FilesSortBy): string | number {
  switch (sort_by) {
    case 'created_at':
      return row.created_at
    case 'updated_at':
      return row.updated_at
    case 'name':
      return row.filename
    case 'size':
      return row.size
  }
}

export async function listFilesV2(
  db: D1Database,
  input: ListFilesV2Input
): Promise<ListFilesV2Result> {
  const filterSet: FilesFilterSet = {
    user_id: input.user_id,
    service_id: input.service_id,
    folder_id: input.folder_id,
    trash: input.trash,
    search: input.search,
    mime_type: input.mime_type,
  }
  const fp = fingerprint(RESOURCE_CONFIG_FILES, filterSet)

  let cursor_lv: string | number | undefined
  let cursor_li: string | undefined

  if (input.cursor) {
    const decoded = await decodeCursor(input.hmacSecret, input.cursor, {
      sb: input.sort_by,
      sd: input.sort_dir,
      fp,
    })
    cursor_lv = decoded.lv
    cursor_li = decoded.li
  }

  const { sql: whereSql, binds, orderBy } = buildKeysetWhere(RESOURCE_CONFIG_FILES, {
    user_id: input.user_id,
    service_id: input.service_id,
    folder_id: input.folder_id,
    trash: input.trash,
    search: input.search,
    mime_type: input.mime_type,
    sort_by: input.sort_by,
    sort_dir: input.sort_dir,
    cursor_lv,
    cursor_li,
  })

  // Fetch one extra row to detect whether another page exists.
  const fetchLimit = input.limit + 1
  const fullSql = `SELECT ${SELECT_COLUMNS} FROM files WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ?`

  const result = await db
    .prepare(fullSql)
    .bind(...binds, fetchLimit)
    .all<RawFileRow>()
  const rawRows = result.results ?? []

  const hasMore = rawRows.length > input.limit
  const pageRows = hasMore ? rawRows.slice(0, input.limit) : rawRows
  const items = pageRows.map(mapFile)

  let next_cursor: string | null = null
  if (hasMore) {
    const last = pageRows[pageRows.length - 1]
    next_cursor = await encodeCursor(input.hmacSecret, {
      v: 1,
      sb: input.sort_by,
      sd: input.sort_dir,
      lv: lastValue(last, input.sort_by),
      li: last.id,
      fp,
    })
  }

  return { items, next_cursor }
}
