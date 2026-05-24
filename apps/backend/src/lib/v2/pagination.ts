import type { ResourceConfig, FilterDescriptor } from './resource'

export type SortDir = 'asc' | 'desc'

/**
 * Re-export legacy alias for files. Nowy kod powinien używać `FilesSortBy` /
 * `FoldersSortBy` z `resource.ts`.
 * @deprecated import { FilesSortBy } from './resource'
 */
export type SortBy = 'created_at' | 'updated_at' | 'name' | 'size'

export function escapeLikePattern(input: string): string {
  return input
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_')
}

interface BuildBaseWhereCommon {
  trash: 'active' | 'trashed' | 'all'
}

export function buildBaseWhere<S extends string, F extends Record<string, unknown>>(
  config: ResourceConfig<S, F>,
  input: F & BuildBaseWhereCommon
): { sql: string; binds: unknown[] } {
  const conditions: string[] = [...config.baseConditions]
  const binds: unknown[] = []

  // Trash jest specjalny — każdy resource ma is_trashed.
  if (input.trash === 'active') {
    conditions.push('is_trashed = 0')
  } else if (input.trash === 'trashed') {
    conditions.push('is_trashed = 1')
  }
  // 'all' → brak warunku

  for (const filter of config.filters as readonly FilterDescriptor<F>[]) {
    const value = input[filter.key]
    if (value === undefined) continue

    switch (filter.op) {
      case '=':
        conditions.push(`${filter.column} = ?`)
        binds.push(value)
        break
      case 'IS_NULL_OR_EQ':
        if (value === null) {
          conditions.push(`${filter.column} IS NULL`)
        } else {
          conditions.push(`${filter.column} = ?`)
          binds.push(value)
        }
        break
      case 'LIKE_ESCAPED':
        if (typeof value !== 'string' || value === '') break
        conditions.push(`${filter.column} LIKE ? ESCAPE '\\'`)
        binds.push(`%${escapeLikePattern(value)}%`)
        break
    }
  }

  return {
    sql: conditions.join(' AND '),
    binds,
  }
}

interface BuildKeysetCommon<S extends string> extends BuildBaseWhereCommon {
  sort_by: S
  sort_dir: SortDir
  cursor_lv?: string | number
  cursor_li?: string
}

export function buildKeysetWhere<S extends string, F extends Record<string, unknown>>(
  config: ResourceConfig<S, F>,
  input: F & BuildKeysetCommon<S>
): { sql: string; binds: unknown[]; orderBy: string } {
  if (!(input.sort_by in config.sortColumns)) {
    throw new Error(`Unknown sort_by: ${String(input.sort_by)}`)
  }

  const base = buildBaseWhere(config, input)
  const sortCol = config.sortColumns[input.sort_by]
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
