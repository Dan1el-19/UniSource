export type SortBy = 'created_at' | 'updated_at' | 'name' | 'size'
export type SortDir = 'asc' | 'desc'

export const SORT_COLUMN: Record<SortBy, string> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  name: 'filename',
  size: 'size',
}

export interface BuildBaseWhereInput {
  user_id: string
  service_id: string
  folder_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search?: string
  mime_type?: string
}

export interface BuildKeysetWhereInput extends BuildBaseWhereInput {
  sort_by: SortBy
  sort_dir: SortDir
  cursor_lv?: string | number
  cursor_li?: string
}

export function escapeLikePattern(input: string): string {
  return input
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
}

export function buildBaseWhere(input: BuildBaseWhereInput): { sql: string; binds: unknown[] } {
  const conditions: string[] = ['is_main_storage = 0']
  const binds: unknown[] = []

  conditions.push('user_id = ?')
  binds.push(input.user_id)

  conditions.push('service_id = ?')
  binds.push(input.service_id)

  if (input.trash === 'active') {
    conditions.push('is_trashed = 0')
  } else if (input.trash === 'trashed') {
    conditions.push('is_trashed = 1')
  }

  if (input.folder_id !== undefined) {
    if (input.folder_id === null) {
      conditions.push('folder_id IS NULL')
    } else {
      conditions.push('folder_id = ?')
      binds.push(input.folder_id)
    }
  }

  if (input.search) {
    const escaped = escapeLikePattern(input.search)
    conditions.push("filename LIKE ? ESCAPE '\\\\'")
    binds.push(`%${escaped}%`)
  }

  if (input.mime_type) {
    conditions.push('mime_type = ?')
    binds.push(input.mime_type)
  }

  return {
    sql: conditions.join(' AND '),
    binds,
  }
}

export function buildKeysetWhere(input: BuildKeysetWhereInput): {
  sql: string
  binds: unknown[]
  orderBy: string
} {
  if (!(input.sort_by in SORT_COLUMN)) {
    throw new Error(`Unknown sort_by: ${input.sort_by}`)
  }

  const base = buildBaseWhere(input)
  const sortCol = SORT_COLUMN[input.sort_by]
  const dir = input.sort_dir

  let keysetCondition = ''
  if (input.cursor_lv !== undefined && input.cursor_li !== undefined) {
    if (dir === 'desc') {
      keysetCondition = `(${sortCol} < ? OR (${sortCol} = ? AND id < ?))`
    } else {
      keysetCondition = `(${sortCol} > ? OR (${sortCol} = ? AND id > ?))`
    }
    base.binds.push(input.cursor_lv, input.cursor_lv, input.cursor_li)
  }

  const sql = keysetCondition ? `${base.sql} AND ${keysetCondition}` : base.sql
  const orderBy = `${sortCol} ${dir}, id ${dir}`

  return {
    sql,
    binds: base.binds,
    orderBy,
  }
}
