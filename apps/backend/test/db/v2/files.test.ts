import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { listFilesV2, type FileRowV2 } from '../../../src/db/v2/files'
import { encodeCursor, fingerprint } from '../../../src/lib/v2/cursor'
import { V2Error } from '../../../src/lib/v2/errors'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!'

interface SeedFile {
  id: string
  service_id: string
  user_id: string
  folder_id: string | null
  filename: string
  size: number
  mime_type: string
  storage_destination: 'r2' | 'appwrite'
  is_trashed: 0 | 1
  trashed_at: number | null
  created_at: number
  updated_at: number
  is_main_storage: 0 | 1
}

async function insertFolder(id: string, service_id: string, user_id: string) {
  await env.APP_DB.prepare(
    `INSERT INTO folders (id, service_id, user_id, parent_id, name, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`
  )
    .bind(id, service_id, user_id, id, 1_700_000_000, 1_700_000_000)
    .run()
}

async function insertFile(row: SeedFile) {
  await env.APP_DB.prepare(
    `INSERT INTO files (
       id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
       storage_destination, storage_key, bucket, is_trashed, trashed_at,
       created_at, updated_at, is_main_storage
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      row.id,
      row.service_id,
      row.user_id,
      row.folder_id,
      null, // upload_id
      row.filename,
      row.size,
      row.mime_type,
      row.storage_destination,
      `key-${row.id}`,
      'primary',
      row.is_trashed,
      row.trashed_at,
      row.created_at,
      row.updated_at,
      row.is_main_storage
    )
    .run()
}

async function clearFiles() {
  await env.APP_DB.prepare('DELETE FROM files').run()
  await env.APP_DB.prepare('DELETE FROM folders').run()
}

let seeded: SeedFile[] = []

async function seedDataset() {
  seeded = []
  // Folders the seeded files reference (FK files.folder_id → folders.id).
  await insertFolder('folder-a', 'svc-a', 'user-1')
  await insertFolder('folder-b', 'svc-a', 'user-1')

  // 50 user files for user-1/svc-a, mix of folders, trashed/active, varied
  // created_at/updated_at/filename/size. Filenames intentionally reuse strings
  // so the (filename, id) tiebreaker has something to disambiguate.
  for (let i = 0; i < 50; i++) {
    const baseTs = 1_700_000_000 + i * 100
    const folder = i % 5 === 0 ? null : i % 5 === 1 ? 'folder-a' : 'folder-b'
    const trashed: 0 | 1 = i % 7 === 0 ? 1 : 0
    seeded.push({
      id: `f-${String(i).padStart(3, '0')}`,
      service_id: 'svc-a',
      user_id: 'user-1',
      folder_id: folder,
      // Mix of names: some unique, several share "invoice-shared" so we can
      // exercise the (filename, id) tiebreaker.
      filename:
        i % 4 === 0
          ? `invoice-${String(i).padStart(3, '0')}.pdf`
          : i % 4 === 1
            ? 'invoice-shared.pdf'
            : i % 4 === 2
              ? `report-${String(i).padStart(3, '0')}.txt`
              : 'invoice-shared.pdf',
      size: ((i * 1009) % 9973) + 100, // pseudo-random but deterministic
      mime_type: i % 3 === 0 ? 'application/pdf' : i % 3 === 1 ? 'image/png' : 'text/plain',
      storage_destination: 'r2',
      is_trashed: trashed,
      trashed_at: trashed ? baseTs + 50 : null,
      created_at: baseTs,
      updated_at: baseTs + 25,
      is_main_storage: 0,
    })
  }

  // 5 main-storage files for the same user/service — must NEVER appear in
  // listFilesV2 results.
  for (let i = 0; i < 5; i++) {
    seeded.push({
      id: `main-${i}`,
      service_id: 'svc-a',
      user_id: 'user-1',
      folder_id: null,
      filename: `main-${i}.bin`,
      size: 1024,
      mime_type: 'application/octet-stream',
      storage_destination: 'r2',
      is_trashed: 0,
      trashed_at: null,
      created_at: 1_800_000_000 + i,
      updated_at: 1_800_000_000 + i,
      is_main_storage: 1,
    })
  }

  // Cross-service file (same user-1, different service)
  seeded.push({
    id: 'svc-b-only',
    service_id: 'svc-b',
    user_id: 'user-1',
    folder_id: null,
    filename: 'leaked-from-svc-b.pdf',
    size: 999,
    mime_type: 'application/pdf',
    storage_destination: 'r2',
    is_trashed: 0,
    trashed_at: null,
    created_at: 1_750_000_000,
    updated_at: 1_750_000_000,
    is_main_storage: 0,
  })

  // Cross-user file (same service, different user)
  seeded.push({
    id: 'user-2-only',
    service_id: 'svc-a',
    user_id: 'user-2',
    folder_id: null,
    filename: 'leaked-from-user-2.pdf',
    size: 500,
    mime_type: 'application/pdf',
    storage_destination: 'r2',
    is_trashed: 0,
    trashed_at: null,
    created_at: 1_750_000_000,
    updated_at: 1_750_000_000,
    is_main_storage: 0,
  })

  for (const row of seeded) {
    await insertFile(row)
  }
}

const baseInput = () =>
  ({
    user_id: 'user-1',
    service_id: 'svc-a',
    folder_id: undefined as string | null | undefined,
    trash: 'active' as 'active' | 'trashed' | 'all',
    sort_by: 'created_at' as const,
    sort_dir: 'desc' as const,
    limit: 100,
    hmacSecret: HMAC_SECRET,
  })

describe('listFilesV2', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
    await seedDataset()
  }, TEST_TIMEOUT)

  describe('trash filter', () => {
    it('trash=active returns only non-trashed user files', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'active' })
      expect(result.items.every((r) => r.is_trashed === false)).toBe(true)
      const expectedCount = seeded.filter(
        (s) => s.user_id === 'user-1' && s.service_id === 'svc-a' && s.is_main_storage === 0 && s.is_trashed === 0
      ).length
      expect(result.items).toHaveLength(expectedCount)
    })

    it('trash=trashed returns only trashed user files', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'trashed' })
      expect(result.items.every((r) => r.is_trashed === true)).toBe(true)
      const expectedCount = seeded.filter(
        (s) => s.user_id === 'user-1' && s.service_id === 'svc-a' && s.is_main_storage === 0 && s.is_trashed === 1
      ).length
      expect(result.items).toHaveLength(expectedCount)
    })

    it('trash=all returns both trashed and active', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all' })
      const expectedCount = seeded.filter(
        (s) => s.user_id === 'user-1' && s.service_id === 'svc-a' && s.is_main_storage === 0
      ).length
      expect(result.items).toHaveLength(expectedCount)
      expect(result.items.some((r) => r.is_trashed === true)).toBe(true)
      expect(result.items.some((r) => r.is_trashed === false)).toBe(true)
    })
  })

  describe('folder filter', () => {
    it('folder_id=undefined returns all user files (global tree)', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', folder_id: undefined })
      const expected = seeded.filter(
        (s) => s.user_id === 'user-1' && s.service_id === 'svc-a' && s.is_main_storage === 0
      )
      expect(result.items).toHaveLength(expected.length)
    })

    it('folder_id=null returns only root files (folder_id IS NULL)', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', folder_id: null })
      expect(result.items.every((r) => r.folder_id === null)).toBe(true)
      const expected = seeded.filter(
        (s) =>
          s.user_id === 'user-1' &&
          s.service_id === 'svc-a' &&
          s.is_main_storage === 0 &&
          s.folder_id === null
      )
      expect(result.items).toHaveLength(expected.length)
    })

    it('folder_id="folder-a" returns only files in that folder', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', folder_id: 'folder-a' })
      expect(result.items.every((r) => r.folder_id === 'folder-a')).toBe(true)
      expect(result.items.length).toBeGreaterThan(0)
    })
  })

  describe('search filter', () => {
    it('search="inv" returns only files whose filename contains "inv"', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', search: 'inv' })
      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items.every((r) => r.filename.includes('inv'))).toBe(true)
    })

    it('literal "%" in search does not act as wildcard (LIKE escape)', async () => {
      // No filename in the dataset contains a literal "%" so the search should
      // return zero rows. If the % was leaked into LIKE unescaped it would
      // wildcard-match many filenames, breaking this assertion.
      await insertFile({
        id: 'pct-row',
        service_id: 'svc-a',
        user_id: 'user-1',
        folder_id: null,
        filename: '50%-off.pdf',
        size: 10,
        mime_type: 'application/pdf',
        storage_destination: 'r2',
        is_trashed: 0,
        trashed_at: null,
        created_at: 1_900_000_000,
        updated_at: 1_900_000_000,
        is_main_storage: 0,
      })

      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', search: '%' })
      // Must only match the literal "%" row, not every filename.
      expect(result.items.map((r) => r.id)).toEqual(['pct-row'])
    })
  })

  describe('mime_type filter', () => {
    it('returns only files matching exact mime_type', async () => {
      const result = await listFilesV2(env.APP_DB, {
        ...baseInput(),
        trash: 'all',
        mime_type: 'image/png',
      })
      expect(result.items.length).toBeGreaterThan(0)
      expect(result.items.every((r) => r.mime_type === 'image/png')).toBe(true)
    })
  })

  describe('sorting + stable pagination', () => {
    async function paginate(input: Parameters<typeof listFilesV2>[1]) {
      const collected: FileRowV2[] = []
      let cursor: string | undefined
      // Bounded loop guards against bugs that would otherwise spin forever.
      for (let i = 0; i < 20; i++) {
        const page = await listFilesV2(env.APP_DB, { ...input, cursor })
        collected.push(...page.items)
        if (!page.next_cursor) break
        cursor = page.next_cursor
      }
      return collected
    }

    it('name asc with limit=5 paginates stably across duplicate filenames', async () => {
      const all = await paginate({ ...baseInput(), trash: 'all', sort_by: 'name', sort_dir: 'asc', limit: 5 })
      // Every returned row should be ordered by (filename asc, id asc) and have
      // no duplicates across pages.
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1]
        const cur = all[i]
        if (prev.filename === cur.filename) {
          expect(cur.id > prev.id).toBe(true)
        } else {
          expect(cur.filename > prev.filename).toBe(true)
        }
      }
      const ids = new Set(all.map((r) => r.id))
      expect(ids.size).toBe(all.length)
    })

    it('name desc with limit=5 paginates stably', async () => {
      const all = await paginate({ ...baseInput(), trash: 'all', sort_by: 'name', sort_dir: 'desc', limit: 5 })
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1]
        const cur = all[i]
        if (prev.filename === cur.filename) {
          expect(cur.id < prev.id).toBe(true)
        } else {
          expect(cur.filename < prev.filename).toBe(true)
        }
      }
    })

    it('size desc with limit=4 paginates stably', async () => {
      const all = await paginate({ ...baseInput(), trash: 'all', sort_by: 'size', sort_dir: 'desc', limit: 4 })
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1]
        const cur = all[i]
        if (prev.size === cur.size) {
          expect(cur.id < prev.id).toBe(true)
        } else {
          expect(cur.size < prev.size).toBe(true)
        }
      }
    })

    it('size asc with limit=4 paginates stably', async () => {
      const all = await paginate({ ...baseInput(), trash: 'all', sort_by: 'size', sort_dir: 'asc', limit: 4 })
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1]
        const cur = all[i]
        if (prev.size === cur.size) {
          expect(cur.id > prev.id).toBe(true)
        } else {
          expect(cur.size > prev.size).toBe(true)
        }
      }
    })

    it('created_at desc (default) ordered newest first', async () => {
      const result = await listFilesV2(env.APP_DB, {
        ...baseInput(),
        trash: 'all',
        sort_by: 'created_at',
        sort_dir: 'desc',
      })
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i].created_at <= result.items[i - 1].created_at).toBe(true)
      }
    })

    it('created_at asc ordered oldest first', async () => {
      const result = await listFilesV2(env.APP_DB, {
        ...baseInput(),
        trash: 'all',
        sort_by: 'created_at',
        sort_dir: 'asc',
      })
      for (let i = 1; i < result.items.length; i++) {
        expect(result.items[i].created_at >= result.items[i - 1].created_at).toBe(true)
      }
    })

    it('updated_at desc paginates stably', async () => {
      const all = await paginate({
        ...baseInput(),
        trash: 'all',
        sort_by: 'updated_at',
        sort_dir: 'desc',
        limit: 6,
      })
      for (let i = 1; i < all.length; i++) {
        expect(
          all[i].updated_at < all[i - 1].updated_at ||
            (all[i].updated_at === all[i - 1].updated_at && all[i].id < all[i - 1].id)
        ).toBe(true)
      }
    })

    it('updated_at asc paginates stably', async () => {
      const all = await paginate({
        ...baseInput(),
        trash: 'all',
        sort_by: 'updated_at',
        sort_dir: 'asc',
        limit: 6,
      })
      for (let i = 1; i < all.length; i++) {
        expect(
          all[i].updated_at > all[i - 1].updated_at ||
            (all[i].updated_at === all[i - 1].updated_at && all[i].id > all[i - 1].id)
        ).toBe(true)
      }
    })
  })

  describe('cursor validation', () => {
    it('cursor minted under trash=active is rejected when reused with trash=trashed (fp mismatch)', async () => {
      const activeFp = fingerprint({
        user_id: 'user-1',
        service_id: 'svc-a',
        folder_id: undefined,
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      })
      const cursor = await encodeCursor(HMAC_SECRET, {
        v: 1,
        sb: 'created_at',
        sd: 'desc',
        lv: 1_700_000_000,
        li: 'f-001',
        fp: activeFp,
      })

      await expect(
        listFilesV2(env.APP_DB, { ...baseInput(), trash: 'trashed', cursor })
      ).rejects.toMatchObject({ code: 'cursor_invalid' })
    })

    it('cursor minted with sort_by=created_at is rejected at sort_by=name (sb mismatch)', async () => {
      const fp = fingerprint({
        user_id: 'user-1',
        service_id: 'svc-a',
        folder_id: undefined,
        trash: 'all',
        search: undefined,
        mime_type: undefined,
      })
      const cursor = await encodeCursor(HMAC_SECRET, {
        v: 1,
        sb: 'created_at',
        sd: 'desc',
        lv: 1_700_000_000,
        li: 'f-001',
        fp,
      })

      await expect(
        listFilesV2(env.APP_DB, {
          ...baseInput(),
          trash: 'all',
          sort_by: 'name',
          cursor,
        })
      ).rejects.toBeInstanceOf(V2Error)
    })

    it('cursor with valid base64 body but tampered signature is rejected', async () => {
      const fp = fingerprint({
        user_id: 'user-1',
        service_id: 'svc-a',
        folder_id: undefined,
        trash: 'all',
        search: undefined,
        mime_type: undefined,
      })
      const real = await encodeCursor(HMAC_SECRET, {
        v: 1,
        sb: 'created_at',
        sd: 'desc',
        lv: 1_700_000_000,
        li: 'f-001',
        fp,
      })
      const [body] = real.split('.')
      // Replace the signature with a base64url-shaped but bogus value.
      const tampered = `${body}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

      await expect(
        listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', cursor: tampered })
      ).rejects.toMatchObject({ code: 'cursor_invalid' })
    })

    it('cursor round-trip works (decode → next page → no overlap)', async () => {
      const first = await listFilesV2(env.APP_DB, {
        ...baseInput(),
        trash: 'all',
        sort_by: 'created_at',
        sort_dir: 'desc',
        limit: 10,
      })
      expect(first.next_cursor).not.toBeNull()
      expect(first.items).toHaveLength(10)

      const second = await listFilesV2(env.APP_DB, {
        ...baseInput(),
        trash: 'all',
        sort_by: 'created_at',
        sort_dir: 'desc',
        limit: 10,
        cursor: first.next_cursor!,
      })

      const firstIds = new Set(first.items.map((r) => r.id))
      const overlap = second.items.filter((r) => firstIds.has(r.id))
      expect(overlap).toHaveLength(0)
    })
  })

  describe('limit handling', () => {
    it('limit=100 (FILES_MAX_LIMIT) executes successfully', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', limit: 100 })
      // With ~50 user files this fits in a single page.
      expect(result.items.length).toBeLessThanOrEqual(100)
      expect(result.next_cursor).toBeNull()
    })
  })

  describe('isolation', () => {
    it('cross-service: user-1 of svc-a does NOT see svc-b files', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all' })
      expect(result.items.every((r) => r.service_id === 'svc-a')).toBe(true)
      expect(result.items.find((r) => r.id === 'svc-b-only')).toBeUndefined()
    })

    it('cross-user within same service: user-1 does NOT see user-2 files', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all' })
      expect(result.items.every((r) => r.user_id === 'user-1')).toBe(true)
      expect(result.items.find((r) => r.id === 'user-2-only')).toBeUndefined()
    })

    it('is_main_storage=1 files NEVER appear in results', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', limit: 100 })
      expect(result.items.find((r) => r.id.startsWith('main-'))).toBeUndefined()
    })
  })

  describe('mapFile output shape', () => {
    it('returned rows have no storage_key or bucket', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', limit: 5 })
      expect(result.items.length).toBeGreaterThan(0)
      for (const item of result.items) {
        expect(item).not.toHaveProperty('storage_key')
        expect(item).not.toHaveProperty('bucket')
      }
    })

    it('is_trashed is exposed as boolean (not 0|1)', async () => {
      const result = await listFilesV2(env.APP_DB, { ...baseInput(), trash: 'all', limit: 50 })
      for (const item of result.items) {
        expect(typeof item.is_trashed).toBe('boolean')
      }
      expect(result.items.some((r) => r.is_trashed === true)).toBe(true)
      expect(result.items.some((r) => r.is_trashed === false)).toBe(true)
    })
  })
})
