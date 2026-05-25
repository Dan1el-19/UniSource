/**
 * Route tests for GET /v2/folders.
 *
 * Uses the service-isolation pattern: a mini Hono app with pre-set auth
 * context, avoiding JWT complexity. The v2 sub-app is mounted directly.
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
const SERVICE_ID = 'svc-1'
const USER_ID = 'user-A'

// Fake env with CURSOR_HMAC_SECRET injected
const testEnv = {
  ...env,
  CURSOR_HMAC_SECRET: HMAC_SECRET,
} as unknown as CloudflareBindings

// ---------------------------------------------------------------------------
// Build a test app with pre-set auth context
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
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

async function clearFolders() {
  await env.APP_DB.prepare('DELETE FROM folders').run()
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /v2/folders', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFolders()
  }, TEST_TIMEOUT)

  it('returns empty page when no folders', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/folders'), testEnv)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body).toEqual({ items: [], page: { limit: 25, next_cursor: null } })
  }, TEST_TIMEOUT)

  it('always sets X-Request-Id in response', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/folders'), testEnv)
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
  }, TEST_TIMEOUT)

  it('returns v2 envelope shape { items, page }', async () => {
    await seedFolders([
      { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
        color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
    ])
    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/folders'), testEnv)
    const body = await res.json() as any
    expect(Object.keys(body).sort()).toEqual(['items', 'page'])
    expect(Object.keys(body.page).sort()).toEqual(['limit', 'next_cursor'])
    expect(body.items[0].is_trashed).toBe(false)
    expect(typeof body.items[0].is_trashed).toBe('boolean')
  }, TEST_TIMEOUT)

  it('paginates via cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await seedFolders([{ id: `f${i}`, user_id: 'user-A', service_id: 'svc-1', parent_id: null,
        name: `f${i}`, color_tag: null, is_trashed: 0, trashed_at: null,
        created_at: 100 + i, updated_at: 100 + i }])
    }
    const app = buildApp()
    const r1 = await app.fetch(new Request('http://localhost/v2/folders?limit=2'), testEnv)
    const b1 = await r1.json() as any
    expect(b1.items).toHaveLength(2)
    expect(b1.page.next_cursor).not.toBeNull()

    const r2 = await app.fetch(
      new Request(`http://localhost/v2/folders?limit=2&cursor=${encodeURIComponent(b1.page.next_cursor)}`),
      testEnv
    )
    const b2 = await r2.json() as any
    expect(b2.items).toHaveLength(1)
    expect(b2.page.next_cursor).toBeNull()
  }, TEST_TIMEOUT)

  it('returns cursor_invalid when filter changed', async () => {
    for (let i = 0; i < 3; i++) {
      await seedFolders([{ id: `f${i}`, user_id: 'user-A', service_id: 'svc-1', parent_id: null,
        name: `f${i}`, color_tag: null, is_trashed: 0, trashed_at: null,
        created_at: 100 + i, updated_at: 100 + i }])
    }
    const app = buildApp()
    const r1 = await app.fetch(new Request('http://localhost/v2/folders?limit=2'), testEnv)
    const b1 = await r1.json() as any

    const r2 = await app.fetch(
      new Request(`http://localhost/v2/folders?limit=2&trash=trashed&cursor=${encodeURIComponent(b1.page.next_cursor)}`),
      testEnv
    )
    expect(r2.status).toBe(400)
    const b2 = await r2.json() as any
    expect(b2.error.code).toBe('cursor_invalid')
    expect(b2.error.request_id).toBeTruthy()
  }, TEST_TIMEOUT)

  it('returns cursor_invalid for tampered signature', async () => {
    const tampered = 'eyJ2IjoxLCJzYiI6ImNyZWF0ZWRfYXQiLCJzZCI6ImRlc2MiLCJsdiI6MTAwLCJsaSI6ImYiLCJmcCI6IjEyMyJ9.fake-sig'
    const app = buildApp()
    const res = await app.fetch(
      new Request(`http://localhost/v2/folders?cursor=${encodeURIComponent(tampered)}`),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('cursor_invalid')
  }, TEST_TIMEOUT)

  it('returns search_too_long for >100 char search', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request(`http://localhost/v2/folders?search=${'x'.repeat(101)}`),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('search_too_long')
  }, TEST_TIMEOUT)

  it('returns validation_error for sort_by=size (not allowed for folders)', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders?sort_by=size'),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
    expect(body.error.details).toBeDefined()
  }, TEST_TIMEOUT)

  it('escapes literal % in search', async () => {
    await seedFolders([
      { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: '50% off',
        color_tag: null, is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
      { id: 'f2', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: '500 abc',
        color_tag: null, is_trashed: 0, trashed_at: null, created_at: 200, updated_at: 200 },
    ])
    const app = buildApp()
    const res = await app.fetch(
      new Request(`http://localhost/v2/folders?search=${encodeURIComponent('50%')}`),
      testEnv
    )
    const body = await res.json() as any
    expect(body.items.map((i: any) => i.id)).toEqual(['f1'])
  }, TEST_TIMEOUT)

  it('rejects without auth — HTTPException(401) inside sub-app → V2ErrorResponse shape', async () => {
    const { HTTPException } = await import('hono/http-exception')
    const { v2RequestIdGuard } = await import('../../../src/middleware/v2RequestIdGuard')
    const { v2ErrorHandler } = await import('../../../src/middleware/v2Errors')
    const testV2 = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
    testV2.use('*', v2RequestIdGuard)
    testV2.onError(v2ErrorHandler)
    testV2.get('/folders', () => { throw new HTTPException(401, { message: 'Unauthorized' }) })
    const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
    app.route('/v2', testV2)
    const res = await app.fetch(new Request('http://localhost/v2/folders'), testEnv)
    expect(res.status).toBe(401)
    const body = await res.json() as any
    expect(body.error.code).toBe('unauthorized')
    expect(body.error.request_id).toBeTruthy()
  }, TEST_TIMEOUT)

  it('does not expose internal fields (no extra columns)', async () => {
    await seedFolders([
      { id: 'f1', user_id: 'user-A', service_id: 'svc-1', parent_id: null, name: 'a',
        color_tag: 'blue', is_trashed: 0, trashed_at: null, created_at: 100, updated_at: 100 },
    ])
    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/folders'), testEnv)
    const body = await res.json() as any
    const item = body.items[0]
    expect(Object.keys(item).sort()).toEqual([
      'color_tag', 'created_at', 'id', 'is_trashed', 'name',
      'parent_id', 'service_id', 'trashed_at', 'updated_at', 'user_id',
    ])
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// GET /v2/folders/:id/breadcrumbs
// ---------------------------------------------------------------------------
describe('GET /v2/folders/:id/breadcrumbs', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFolders()
  }, TEST_TIMEOUT)

  it('returns breadcrumbs in v2 envelope shape with FolderRowV2 items', async () => {
    await seedFolders([
      { id: 'root', user_id: USER_ID, service_id: SERVICE_ID, parent_id: null,
        name: 'Root', color_tag: null, is_trashed: 0, trashed_at: null,
        created_at: 100, updated_at: 100 },
      { id: 'child', user_id: USER_ID, service_id: SERVICE_ID, parent_id: 'root',
        name: 'Child', color_tag: '', is_trashed: 0, trashed_at: null,
        created_at: 200, updated_at: 200 },
    ])

    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders/child/breadcrumbs'),
      testEnv
    )

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(Object.keys(body)).toEqual(['breadcrumbs'])
    expect(body.breadcrumbs).toHaveLength(2)
    // is_trashed must be boolean (FolderRowV2 shape)
    expect(typeof body.breadcrumbs[0].is_trashed).toBe('boolean')
    expect(body.breadcrumbs[0].is_trashed).toBe(false)
    // color_tag: '' should be normalised to null
    expect(body.breadcrumbs[1].color_tag).toBeNull()
    // Ensure no extra columns
    expect(Object.keys(body.breadcrumbs[0]).sort()).toEqual([
      'color_tag', 'created_at', 'id', 'is_trashed', 'name',
      'parent_id', 'service_id', 'trashed_at', 'updated_at', 'user_id',
    ])
  }, TEST_TIMEOUT)

  it('returns 404 with error.code=not_found when folder does not exist', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders/missing/breadcrumbs'),
      testEnv
    )

    expect(res.status).toBe(404)
    const body = await res.json() as any
    expect(body.error.code).toBe('not_found')
    expect(body.error.message).toBe('Folder not found')
    expect(body.error.request_id).toBeTruthy()
    // Must NOT contain legacy shape
    expect('message' in body).toBe(false)
  }, TEST_TIMEOUT)

  it('returns X-Request-Id header on 404', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders/missing/breadcrumbs'),
      testEnv
    )
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// POST /v2/folders/bulk-trash
// ---------------------------------------------------------------------------
describe('POST /v2/folders/bulk-trash', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFolders()
  }, TEST_TIMEOUT)

  it('trashes provided folders and returns processed_count', async () => {
    await seedFolders([
      { id: 'f1', user_id: USER_ID, service_id: SERVICE_ID, parent_id: null,
        name: 'a', color_tag: null, is_trashed: 0, trashed_at: null,
        created_at: 100, updated_at: 100 },
      { id: 'f2', user_id: USER_ID, service_id: SERVICE_ID, parent_id: null,
        name: 'b', color_tag: null, is_trashed: 0, trashed_at: null,
        created_at: 200, updated_at: 200 },
    ])

    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders/bulk-trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['f1', 'f2'] }),
      }),
      testEnv
    )

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.success).toBe(true)
    expect(body.processed_count).toBe(2)
    expect(body.failed_ids).toBeUndefined()
  }, TEST_TIMEOUT)

  it('returns validation_error with v2 shape on invalid body', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/folders/bulk-trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      }),
      testEnv
    )

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error.code).toBe('validation_error')
    expect(body.error.request_id).toBeTruthy()
  }, TEST_TIMEOUT)
})
