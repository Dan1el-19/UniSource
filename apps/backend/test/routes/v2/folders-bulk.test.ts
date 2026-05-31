/**
 * Tests for POST /v2/folders/bulk (consolidated bulk endpoint).
 *
 * Covers Task 12 happy path (4 actions + cycle prevention) +
 * Task 14 edge cases (100-id limit, partial success).
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
const SERVICE_ID = 'svc-folders-bulk'
const USER_ID = 'user-folders-bulk'

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
    c.set('apiKeyPermissions', ['admin'])
    await next()
  })
  app.route('/v2', v2Router)
  return app
}

async function clearAll() {
  await env.APP_DB.prepare('DELETE FROM files').run()
  await env.APP_DB.prepare('DELETE FROM folders').run()
}

interface FolderSeed {
  id: string
  parent_id?: string | null
  is_trashed?: 0 | 1
  name?: string
}

async function seedFolder(opts: FolderSeed) {
  const now = 1_700_000_000
  await env.APP_DB.prepare(
    `INSERT INTO folders (id, user_id, service_id, parent_id, name, color_tag,
       is_trashed, trashed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`
  ).bind(
    opts.id,
    USER_ID,
    SERVICE_ID,
    opts.parent_id ?? null,
    opts.name ?? `folder-${opts.id}`,
    opts.is_trashed ?? 0,
    opts.is_trashed === 1 ? now : null,
    now,
    now
  ).run()
}

async function bulkPost(body: unknown): Promise<Response> {
  const app = buildApp()
  return app.fetch(
    new Request('http://localhost/v2/folders/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    testEnv
  )
}

// ---------------------------------------------------------------------------
// Happy path — Task 12
// ---------------------------------------------------------------------------
describe('POST /v2/folders/bulk', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearAll()
  }, TEST_TIMEOUT)

  it('action: "trash" — trashes valid folder ids', async () => {
    await seedFolder({ id: 'folder_a' })
    await seedFolder({ id: 'folder_b' })

    const res = await bulkPost({ action: 'trash', ids: ['folder_a', 'folder_b'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body).toEqual({ processed: ['folder_a', 'folder_b'], failed: [] })
  }, TEST_TIMEOUT)

  it('action: "restore" — restores trashed folders', async () => {
    await seedFolder({ id: 'folder_trashed_1', is_trashed: 1 })

    const res = await bulkPost({ action: 'restore', ids: ['folder_trashed_1'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('folder_trashed_1')
  }, TEST_TIMEOUT)

  it('action: "move" — requires explicit parent_id (null for root)', async () => {
    await seedFolder({ id: 'folder_a' })

    const res = await bulkPost({ action: 'move', ids: ['folder_a'], parent_id: null })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('folder_a')
  }, TEST_TIMEOUT)

  it('action: "move" — cycle prevention returns failed with code: conflict', async () => {
    await seedFolder({ id: 'folder_parent' })
    await seedFolder({ id: 'folder_child', parent_id: 'folder_parent' })

    // Trying to move folder_parent INTO folder_child → cycle.
    const res = await bulkPost({ action: 'move', ids: ['folder_parent'], parent_id: 'folder_child' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toEqual([])
    expect(body.failed).toEqual([
      { id: 'folder_parent', code: 'conflict', message: expect.stringContaining('Cycle') },
    ])
  }, TEST_TIMEOUT)

  it('action: "move" — cannot move folder into itself', async () => {
    await seedFolder({ id: 'folder_a' })

    const res = await bulkPost({ action: 'move', ids: ['folder_a'], parent_id: 'folder_a' })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toEqual([])
    expect(body.failed[0]).toMatchObject({
      id: 'folder_a', code: 'conflict', message: expect.stringContaining('itself'),
    })
  }, TEST_TIMEOUT)

  it('action: "delete" — permanently removes folders (subtree handled at handler level)', async () => {
    await seedFolder({ id: 'folder_a' })

    const res = await bulkPost({ action: 'delete', ids: ['folder_a'] })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.processed).toContain('folder_a')

    // Confirm gone
    const after = await env.APP_DB.prepare(
      'SELECT id FROM folders WHERE id = ? AND user_id = ? AND service_id = ?'
    ).bind('folder_a', USER_ID, SERVICE_ID).first()
    expect(after).toBeNull()
  }, TEST_TIMEOUT)

  it('rejects unknown action', async () => {
    const res = await bulkPost({ action: 'fold', ids: ['folder_a'] })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// Limits — Task 14
// ---------------------------------------------------------------------------
describe('POST /v2/folders/bulk — limits', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearAll()
  }, TEST_TIMEOUT)

  it('rejects more than 100 IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `folder_${i}`)
    const res = await bulkPost({ action: 'trash', ids })
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
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
describe('POST /v2/folders/bulk — partial success', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearAll()
    await seedFolder({ id: 'folder_a' })
    await seedFolder({ id: 'folder_b' })
    await seedFolder({ id: 'folder_c', is_trashed: 1 })
  }, TEST_TIMEOUT)

  it('partitions processed vs failed across mixed-state IDs', async () => {
    const res = await bulkPost({
      action: 'trash',
      ids: ['folder_a', 'folder_b', 'folder_missing', 'folder_c'],
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any

    expect(body.processed).toEqual(expect.arrayContaining(['folder_a', 'folder_b']))
    expect(body.processed.length).toBe(2)

    expect(body.failed).toEqual(expect.arrayContaining([
      { id: 'folder_missing', code: 'not_found', message: expect.any(String) },
      { id: 'folder_c', code: 'conflict', message: expect.any(String) },
    ]))
    expect(body.failed.length).toBe(2)
  }, TEST_TIMEOUT)

  it('cycle prevention surfaces as failed entry, not 4xx', async () => {
    await seedFolder({ id: 'folder_root', name: 'root' })
    await seedFolder({ id: 'folder_mid', parent_id: 'folder_root', name: 'mid' })
    await seedFolder({ id: 'folder_leaf', parent_id: 'folder_mid', name: 'leaf' })

    const res = await bulkPost({
      action: 'move',
      ids: ['folder_root'],
      parent_id: 'folder_leaf',
    })
    expect(res.status).toBe(200) // success status, error is per-id
    const body = await res.json() as any
    expect(body.processed).toEqual([])
    expect(body.failed[0]).toMatchObject({
      id: 'folder_root',
      code: 'conflict',
      message: expect.stringContaining('Cycle'),
    })
  }, TEST_TIMEOUT)
})
