/**
 * Tests for POST /v2/files/bulk (consolidated bulk endpoint).
 *
 * Covers Task 10 happy path (4 actions) + Task 14 edge cases
 * (100-id limit, partial success, target validation).
 */
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import v2Router from '../../../src/routes/v2/index'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!'
const SERVICE_ID = 'svc-bulk'
const USER_ID = 'user-bulk'

const testEnv = {
  ...env,
  CURSOR_HMAC_SECRET: HMAC_SECRET,
} as unknown as CloudflareBindings

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', USER_ID as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set('authType', 'apikey' as WorkerVariables['authType'])
    await next()
  })
  app.route('/v2', v2Router)
  return app
}

async function clearFiles() {
  await env.APP_DB.prepare('DELETE FROM files').run()
  await env.APP_DB.prepare('DELETE FROM folders').run()
}

async function insertFile(opts: {
  id: string
  filename?: string
  is_trashed?: 0 | 1
  folder_id?: string | null
}) {
  const now = 1_700_000_000
  await env.APP_DB.prepare(
    `INSERT INTO files (
       id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
       storage_destination, storage_key, bucket, is_trashed, trashed_at,
       created_at, updated_at, is_main_storage
     ) VALUES (?, ?, ?, ?, NULL, ?, 1024, 'text/plain', 'r2', ?, 'primary', ?, ?, ?, ?, 0)`
  ).bind(
    opts.id,
    SERVICE_ID,
    USER_ID,
    opts.folder_id ?? null,
    opts.filename ?? `file-${opts.id}.txt`,
    `key-${opts.id}`,
    opts.is_trashed ?? 0,
    opts.is_trashed === 1 ? now : null,
    now,
    now
  ).run()
}

async function insertFolder(opts: { id: string; is_trashed?: 0 | 1 }) {
  const now = 1_700_000_000
  await env.APP_DB.prepare(
    `INSERT INTO folders (id, user_id, service_id, parent_id, name, color_tag,
       is_trashed, trashed_at, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)`
  ).bind(
    opts.id,
    USER_ID,
    SERVICE_ID,
    `folder-${opts.id}`,
    opts.is_trashed ?? 0,
    opts.is_trashed === 1 ? now : null,
    now,
    now
  ).run()
}

async function bulkPost(body: unknown): Promise<Response> {
  const app = buildApp()
  return app.fetch(
    new Request('http://localhost/v2/files/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    testEnv
  )
}

// ---------------------------------------------------------------------------
// Happy path — Task 10
// ---------------------------------------------------------------------------
describe('POST /v2/files/bulk', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
  }, TEST_TIMEOUT)

  it('action: "trash" — moves all valid IDs to trash', async () => {
    await insertFile({ id: 'file_1' })
    await insertFile({ id: 'file_2' })

    const res = await bulkPost({ action: 'trash', ids: ['file_1', 'file_2'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body).toEqual({ processed: ['file_1', 'file_2'], failed: [] })
  }, TEST_TIMEOUT)

  it('action: "restore" — restores trashed files', async () => {
    await insertFile({ id: 'file_trashed_1', is_trashed: 1 })

    const res = await bulkPost({ action: 'restore', ids: ['file_trashed_1'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('file_trashed_1')
    expect(body.failed).toEqual([])
  }, TEST_TIMEOUT)

  it('action: "move" — requires explicit folder_id (null for root)', async () => {
    await insertFile({ id: 'file_1' })

    const res = await bulkPost({ action: 'move', ids: ['file_1'], folder_id: null })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('file_1')
  }, TEST_TIMEOUT)

  it('action: "move" — rejects request without folder_id', async () => {
    const res = await bulkPost({ action: 'move', ids: ['file_1'] })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
  }, TEST_TIMEOUT)

  it('action: "delete" — permanently removes files', async () => {
    await insertFile({ id: 'file_1' })

    const res = await bulkPost({ action: 'delete', ids: ['file_1'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('file_1')

    // Confirm gone
    const after = await env.APP_DB.prepare(
      'SELECT id FROM files WHERE id = ? AND user_id = ? AND service_id = ?'
    ).bind('file_1', USER_ID, SERVICE_ID).first()
    expect(after).toBeNull()
  }, TEST_TIMEOUT)

  it('rejects unknown action', async () => {
    const res = await bulkPost({ action: 'frobnicate', ids: ['file_1'] })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// Limits — Task 14
// ---------------------------------------------------------------------------
describe('POST /v2/files/bulk — limits', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
  }, TEST_TIMEOUT)

  it('rejects more than 100 IDs with validation_error', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `file_${i}`)
    const res = await bulkPost({ action: 'trash', ids })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
  }, TEST_TIMEOUT)

  it('accepts exactly 100 IDs', async () => {
    for (let i = 0; i < 100; i++) await insertFile({ id: `file_${i}` })
    const ids = Array.from({ length: 100 }, (_, i) => `file_${i}`)

    const res = await bulkPost({ action: 'trash', ids })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed.length + body.failed.length).toBe(100)
  }, TEST_TIMEOUT)

  it('rejects empty ids array', async () => {
    const res = await bulkPost({ action: 'trash', ids: [] })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// Partial success — Task 14
// ---------------------------------------------------------------------------
describe('POST /v2/files/bulk — partial success', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
    await insertFile({ id: 'file_real_1' })
    await insertFile({ id: 'file_real_2' })
    await insertFile({ id: 'file_real_3', is_trashed: 1 })
  }, TEST_TIMEOUT)

  it('partitions processed vs failed across mixed-state IDs', async () => {
    const res = await bulkPost({
      action: 'trash',
      ids: ['file_real_1', 'file_real_2', 'file_does_not_exist', 'file_real_3'],
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any

    expect(body.processed).toEqual(expect.arrayContaining(['file_real_1', 'file_real_2']))
    expect(body.processed.length).toBe(2)

    expect(body.failed).toEqual(expect.arrayContaining([
      { id: 'file_does_not_exist', code: 'not_found', message: expect.any(String) },
      { id: 'file_real_3', code: 'conflict', message: expect.any(String) },
    ]))
    expect(body.failed.length).toBe(2)
  }, TEST_TIMEOUT)

  it('move with non-existent target folder returns 404 (whole request fails)', async () => {
    const res = await bulkPost({
      action: 'move',
      ids: ['file_real_1'],
      folder_id: 'folder_does_not_exist',
    })
    expect(res.status).toBe(404)
    const body = await res.json() as any
    expect(body.error.code).toBe('not_found')
  }, TEST_TIMEOUT)

  it('move with trashed target folder returns 409 (whole request fails)', async () => {
    await insertFolder({ id: 'folder_trashed', is_trashed: 1 })

    const res = await bulkPost({
      action: 'move',
      ids: ['file_real_1'],
      folder_id: 'folder_trashed',
    })
    expect(res.status).toBe(409)
    const body = await res.json() as any
    expect(body.error.code).toBe('conflict')
  }, TEST_TIMEOUT)
})
