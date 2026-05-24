import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { listFoldersV2 } from '../../../src/db/v2/folders'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000
const SECRET = 'a'.repeat(32)

interface SeedFolder {
  id: string
  user_id: string
  service_id: string
  parent_id: string | null
  name: string
  color_tag: string | null
  is_trashed: 0 | 1
  trashed_at: number | null
  created_at: number
  updated_at: number
}

async function seedFolders(folders: SeedFolder[]) {
  for (const f of folders) {
    await env.APP_DB.prepare(
      `INSERT INTO folders (id, user_id, service_id, parent_id, name, color_tag,
         is_trashed, trashed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      f.id, f.user_id, f.service_id, f.parent_id, f.name, f.color_tag,
      f.is_trashed, f.trashed_at, f.created_at, f.updated_at
    ).run()
  }
}

const baseInput = {
  user_id: 'user-A',
  service_id: 'svc-1',
  parent_id: undefined as string | null | undefined,
  trash: 'active' as const,
  sort_by: 'created_at' as const,
  sort_dir: 'desc' as const,
  limit: 10,
  hmacSecret: SECRET,
}

describe('listFoldersV2', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await env.APP_DB.prepare('DELETE FROM folders').run()
  })

  describe('trash filter', () => {
    beforeEach(async () => {
      await seedFolders([
        { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
        { id: 'f2', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'b',
          color_tag: null, is_trashed: 1, trashed_at: 200, created_at: 200, updated_at: 200 },
      ])
    })

    it('returns only active when trash=active', async () => {
      const result = await listFoldersV2(env.APP_DB, baseInput)
      expect(result.items.map(i => i.id)).toEqual(['f1'])
    })

    it('returns only trashed when trash=trashed', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, trash: 'trashed' })
      expect(result.items.map(i => i.id)).toEqual(['f2'])
    })

    it('returns both when trash=all', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, trash: 'all' })
      expect(result.items.map(i => i.id).sort()).toEqual(['f1', 'f2'])
    })
  })

  describe('parent_id filter', () => {
    beforeEach(async () => {
      await seedFolders([
        { id: 'root1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'r1',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
        { id: 'root2', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'r2',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 200, updated_at: 200 },
        { id: 'child1', user_id: 'user-A', service_id: 'svc-1', parent_id: 'root1', name: 'c1',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 300, updated_at: 300 },
      ])
    })

    it('parent_id=undefined returns whole tree', async () => {
      const result = await listFoldersV2(env.APP_DB, baseInput)
      expect(result.items).toHaveLength(3)
    })

    it('parent_id=null returns root only', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, parent_id: null })
      expect(result.items.map(i => i.id).sort()).toEqual(['root1', 'root2'])
    })

    it('parent_id="root1" returns children of root1', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, parent_id: 'root1' })
      expect(result.items.map(i => i.id)).toEqual(['child1'])
    })
  })

  describe('search escape', () => {
    beforeEach(async () => {
      await seedFolders([
        { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: '100% done',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
        { id: 'f2', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: '100 things',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 200, updated_at: 200 },
        { id: 'f3', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'snake_case',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 300, updated_at: 300 },
      ])
    })

    it('escapes % wildcard (literal %)', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, search: '100%' })
      expect(result.items.map(i => i.id)).toEqual(['f1'])
    })

    it('escapes _ wildcard (literal _)', async () => {
      const result = await listFoldersV2(env.APP_DB, { ...baseInput, search: 'snake_' })
      expect(result.items.map(i => i.id)).toEqual(['f3'])
    })
  })

  describe('sort + cursor', () => {
    beforeEach(async () => {
      const records: SeedFolder[] = []
      for (let i = 0; i < 12; i++) {
        records.push({
          id: `f${String(i).padStart(2, '0')}`,
          user_id: 'user-A',
          service_id: 'svc-1',
          parent_id: null,
          name: i % 3 === 0 ? 'duplicate' : `name-${i}`,
          color_tag: null,
          is_trashed: 0,
          trashed_at: null,
          created_at: 1000 + i,
          updated_at: 2000 + i,
        })
      }
      await seedFolders(records)
    })

    it('sort name asc paginates without duplicates with same name', async () => {
      const seen = new Set<string>()
      let cursor: string | undefined
      const baseQuery = { ...baseInput, sort_by: 'name' as const, sort_dir: 'asc' as const, limit: 5 }

      for (let page = 0; page < 4; page++) {
        const result = await listFoldersV2(env.APP_DB, { ...baseQuery, cursor })
        for (const item of result.items) {
          expect(seen.has(item.id)).toBe(false)
          seen.add(item.id)
        }
        if (!result.next_cursor) break
        cursor = result.next_cursor
      }
      expect(seen.size).toBe(12)
    })

    it('rejects cursor when filter changes (fingerprint mismatch)', async () => {
      const first = await listFoldersV2(env.APP_DB, { ...baseInput, limit: 5 })
      expect(first.next_cursor).not.toBeNull()

      await expect(
        listFoldersV2(env.APP_DB, {
          ...baseInput,
          limit: 5,
          cursor: first.next_cursor!,
          trash: 'trashed',
        })
      ).rejects.toThrow(/cursor_invalid/)
    })

    it('rejects cursor when sort_by changes', async () => {
      const first = await listFoldersV2(env.APP_DB, { ...baseInput, limit: 5 })
      await expect(
        listFoldersV2(env.APP_DB, {
          ...baseInput,
          limit: 5,
          cursor: first.next_cursor!,
          sort_by: 'name',
        })
      ).rejects.toThrow(/cursor_invalid/)
    })
  })

  describe('isolation', () => {
    beforeEach(async () => {
      await seedFolders([
        { id: 'a-svc1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
        { id: 'a-svc2', user_id: 'user-A', service_id: 'svc-2', parent_id: null, name: 'a',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 200, updated_at: 200 },
        { id: 'b-svc1', user_id: 'user-B', service_id: 'svc-1', parent_id: null, name: 'b',
          color_tag: null, is_trashed: 0, trashed_at: null, created_at: 300, updated_at: 300 },
      ])
    })

    it('cross-service isolation', async () => {
      const r = await listFoldersV2(env.APP_DB, baseInput)
      expect(r.items.map(i => i.id)).toEqual(['a-svc1'])
    })

    it('cross-user isolation', async () => {
      const r = await listFoldersV2(env.APP_DB, { ...baseInput, user_id: 'user-B' })
      expect(r.items.map(i => i.id)).toEqual(['b-svc1'])
    })
  })

  describe('mapper', () => {
    it('coerces empty color_tag to null', async () => {
      await seedFolders([
        { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
          color_tag: '', is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
      ])
      const r = await listFoldersV2(env.APP_DB, baseInput)
      expect(r.items[0].color_tag).toBeNull()
    })

    it('passes through real color_tag', async () => {
      await seedFolders([
        { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
          color_tag: 'blue', is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
      ])
      const r = await listFoldersV2(env.APP_DB, baseInput)
      expect(r.items[0].color_tag).toBe('blue')
    })

    it('converts is_trashed 0|1 to boolean', async () => {
      await seedFolders([
        { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
          color_tag: null, is_trashed: 1, trashed_at: 50, created_at: 100, updated_at: 100 },
      ])
      const r = await listFoldersV2(env.APP_DB, { ...baseInput, trash: 'all' })
      expect(typeof r.items[0].is_trashed).toBe('boolean')
      expect(r.items[0].is_trashed).toBe(true)
    })
  })
})
