import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { buildKeysetWhere } from '../../../src/lib/v2/pagination'
import type { SortBy } from '../../../src/lib/v2/pagination'
import { RESOURCE_CONFIG_FILES } from '../../../src/lib/v2/resource'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000

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

const sortBys = ['created_at', 'updated_at', 'name', 'size'] as const satisfies readonly SortBy[]
const folderIds = [undefined, null, 'folder-x'] as const
const trashes = ['active', 'trashed', 'all'] as const

function planText(rows: Array<Record<string, unknown>>): string {
  return rows
    .map((r) => (typeof r.detail === 'string' ? r.detail : JSON.stringify(r)))
    .join('\n')
}

function folderLabel(folder_id: string | null | undefined): string {
  if (folder_id === undefined) return 'undef'
  if (folder_id === null) return 'null'
  return 'X'
}

describe('listFilesV2 — EXPLAIN QUERY PLAN coverage (36 combinations)', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  for (const sort_by of sortBys) {
    for (const folder_id of folderIds) {
      for (const trash of trashes) {
        const label = `sort=${sort_by} folder=${folderLabel(folder_id)} trash=${trash}`
        it(label, async () => {
          const { sql, binds, orderBy } = buildKeysetWhere(RESOURCE_CONFIG_FILES, {
            user_id: 'u1',
            service_id: 's1',
            folder_id,
            trash,
            sort_by,
            sort_dir: 'desc',
          })
          const fullSql = `SELECT ${SELECT_COLUMNS} FROM files WHERE ${sql} ORDER BY ${orderBy} LIMIT 25`

          const result = await env.APP_DB.prepare(`EXPLAIN QUERY PLAN ${fullSql}`)
            .bind(...binds)
            .all()
          const plan = planText(result.results ?? [])

          if (trash === 'all') {
            // SQLite may pick a partial index even when the trash filter is
            // dropped (the WHERE is_main_storage = 0 still matches). Accept
            // any index path; fail only if the planner falls back to a bare
            // table scan.
            const bareScan = /SCAN files\b(?! USING (INDEX|COVERING))/i.test(plan)
            expect(
              bareScan,
              `trash=all hit a bare SCAN files (no index).\n${label}\nSQL:\n${fullSql}\nPlan:\n${plan}`
            ).toBe(false)
          } else {
            expect(
              plan,
              `Expected USING INDEX idx_files_v2_* but got:\n${label}\nSQL:\n${fullSql}\nPlan:\n${plan}`
            ).toMatch(/USING (?:INDEX|COVERING INDEX) idx_files_v2_/)
          }
        }, TEST_TIMEOUT)
      }
    }
  }
})
