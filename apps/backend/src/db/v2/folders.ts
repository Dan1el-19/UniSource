import type { D1Database } from '@cloudflare/workers-types'
import { buildKeysetWhere, type SortDir } from '../../lib/v2/pagination'
import { decodeCursor, encodeCursor, fingerprint } from '../../lib/v2/cursor'
import {
  RESOURCE_CONFIG_FOLDERS,
  type FoldersSortBy,
  type FoldersFilterSet,
} from '../../lib/v2/resource'

export interface FolderRowV2 {
  id: string
  service_id: string
  user_id: string
  parent_id: string | null
  name: string
  color_tag: string | null
  is_trashed: boolean
  trashed_at: number | null
  created_at: number
  updated_at: number
}

interface RawFolderRow {
  id: string
  service_id: string
  user_id: string
  parent_id: string | null
  name: string
  color_tag: string | null
  is_trashed: 0 | 1
  trashed_at: number | null
  created_at: number
  updated_at: number
}

export interface ListFoldersV2Input {
  user_id: string
  service_id: string
  parent_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search?: string
  sort_by: FoldersSortBy
  sort_dir: SortDir
  limit: number
  cursor?: string
  /** Secret used for cursor HMAC (env.CURSOR_HMAC_SECRET). */
  hmacSecret: string
}

export interface ListFoldersV2Result {
  items: FolderRowV2[]
  next_cursor: string | null
}

const SELECT_COLUMNS = [
  'id',
  'service_id',
  'user_id',
  'parent_id',
  'name',
  'color_tag',
  'is_trashed',
  'trashed_at',
  'created_at',
  'updated_at',
].join(', ')

/**
 * Maps a D1 row to the public v2 shape.
 * - is_trashed: 0|1 → boolean
 * - color_tag: '' → null (canonical "no color")
 */
function mapFolder(row: RawFolderRow): FolderRowV2 {
  return {
    id: row.id,
    service_id: row.service_id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    name: row.name,
    color_tag: row.color_tag === '' ? null : row.color_tag,
    is_trashed: row.is_trashed === 1,
    trashed_at: row.trashed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function lastValue(row: RawFolderRow, sort_by: FoldersSortBy): string | number {
  switch (sort_by) {
    case 'created_at':
      return row.created_at
    case 'updated_at':
      return row.updated_at
    case 'name':
      return row.name
  }
}

export async function listFoldersV2(
  db: D1Database,
  input: ListFoldersV2Input
): Promise<ListFoldersV2Result> {
  const filterSet: FoldersFilterSet = {
    user_id: input.user_id,
    service_id: input.service_id,
    parent_id: input.parent_id,
    trash: input.trash,
    search: input.search,
  }
  const fp = fingerprint(RESOURCE_CONFIG_FOLDERS, filterSet)

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

  const { sql: whereSql, binds, orderBy } = buildKeysetWhere(RESOURCE_CONFIG_FOLDERS, {
    user_id: input.user_id,
    service_id: input.service_id,
    parent_id: input.parent_id,
    trash: input.trash,
    search: input.search,
    sort_by: input.sort_by,
    sort_dir: input.sort_dir,
    cursor_lv,
    cursor_li,
  })

  // Fetch one extra row to detect whether another page exists.
  const fetchLimit = input.limit + 1
  const fullSql = `SELECT ${SELECT_COLUMNS} FROM folders WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ?`

  const result = await db
    .prepare(fullSql)
    .bind(...binds, fetchLimit)
    .all<RawFolderRow>()
  const rawRows = result.results ?? []

  const hasMore = rawRows.length > input.limit
  const pageRows = hasMore ? rawRows.slice(0, input.limit) : rawRows
  const items = pageRows.map(mapFolder)

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
