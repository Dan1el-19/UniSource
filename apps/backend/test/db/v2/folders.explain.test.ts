import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { buildKeysetWhere } from '../../../src/lib/v2/pagination'
import {
  RESOURCE_CONFIG_FOLDERS,
  type FoldersSortBy,
} from '../../../src/lib/v2/resource'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000

const sortBys: FoldersSortBy[] = ['created_at', 'updated_at', 'name']
const parentIds = [undefined, null, 'parent-X'] as const
const trashes = ['active', 'trashed', 'all'] as const

type ParentScope = 'global' | 'root' | 'specific'

function scopeLabel(parent_id: string | null | undefined): ParentScope {
  if (parent_id === undefined) return 'global'
  if (parent_id === null) return 'root'
  return 'specific'
}

function planText(rows: Array<Record<string, unknown>>): string {
  return rows
    .map((r) => (typeof r.detail === 'string' ? r.detail : JSON.stringify(r)))
    .join('\n')
}

describe('listFoldersV2 — EXPLAIN QUERY PLAN coverage (27 combinations)', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  for (const sort_by of sortBys) {
    for (const parent_id of parentIds) {
      for (const trash of trashes) {
        const scope = scopeLabel(parent_id)
        const label = `sort=${sort_by} scope=${scope} trash=${trash}`

        it(label, async () => {
          const { sql, binds, orderBy } = buildKeysetWhere(RESOURCE_CONFIG_FOLDERS, {
            user_id: 'user-A',
            service_id: 'svc-1',
            parent_id,
            trash,
            sort_by,
            sort_dir: 'desc',
          })
          const fullSql = `SELECT id FROM folders WHERE ${sql} ORDER BY ${orderBy} LIMIT 10`

          const result = await env.APP_DB.prepare(`EXPLAIN QUERY PLAN ${fullSql}`)
            .bind(...binds)
            .all()
          const plan = planText(result.results ?? [])

          if (trash === 'all') {
            const bareScan = /SCAN folders\b(?! USING (INDEX|COVERING))/i.test(plan)
            expect(
              bareScan,
              `trash=all hit a bare SCAN folders (no index).\n${label}\nSQL:\n${fullSql}\nPlan:\n${plan}`
            ).toBe(false)
          } else {
            expect(
              plan,
              `Expected USING INDEX idx_folders_v2_* but got:\n${label}\nSQL:\n${fullSql}\nPlan:\n${plan}`
            ).toMatch(/USING (?:INDEX|COVERING INDEX) idx_folders_v2_/)
          }
        }, TEST_TIMEOUT)
      }
    }
  }
})
