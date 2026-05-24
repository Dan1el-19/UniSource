/**
 * Route tests for GET /v2/files and bulk-* regression.
 *
 * Uses the service-isolation pattern: a mini Hono app with pre-set auth
 * context, avoiding JWT complexity. The v2 sub-app (v2RequestIdGuard →
 * requestId → onError → routes) is mounted directly.
 */
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import v2Router from '../../../src/routes/v2/index'
import { encodeCursor, fingerprint } from '../../../src/lib/v2/cursor'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!'
const SERVICE_ID = 'svc-test'
const USER_ID = 'user-test'

// ---------------------------------------------------------------------------
// Build a test app with pre-set auth context + CURSOR_HMAC_SECRET binding
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
async function clearFiles() {
  await env.APP_DB.prepare('DELETE FROM files').run()
}

async function insertFile(opts: {
  id: string
  filename?: string
  size?: number
  mime_type?: string
  is_trashed?: 0 | 1
  created_at?: number
  updated_at?: number
}) {
  const now = 1_700_000_000
  await env.APP_DB.prepare(
    `INSERT INTO files (
       id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
       storage_destination, storage_key, bucket, is_trashed, trashed_at,
       created_at, updated_at, is_main_storage
     ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'r2', ?, 'primary', ?, NULL, ?, ?, 0)`
  )
    .bind(
      opts.id,
      SERVICE_ID,
      USER_ID,
      opts.filename ?? `file-${opts.id}.txt`,
      opts.size ?? 1024,
      opts.mime_type ?? 'text/plain',
      `key-${opts.id}`,
      opts.is_trashed ?? 0,
      opts.created_at ?? now,
      opts.updated_at ?? now
    )
    .run()
}

// Fake env with CURSOR_HMAC_SECRET injected
const testEnv = {
  ...env,
  CURSOR_HMAC_SECRET: HMAC_SECRET,
} as unknown as CloudflareBindings

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /v2/files', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
  }, TEST_TIMEOUT)

  it('returns 200 with correct response shape', async () => {
    await insertFile({ id: 'f-001' })
    await insertFile({ id: 'f-002' })

    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/files'), testEnv)

    expect(res.status).toBe(200)
    const body = await res.json<{ items: unknown[]; page: { limit: number; next_cursor: string | null } }>()
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items).toHaveLength(2)
    expect(typeof body.page.limit).toBe('number')
    expect('next_cursor' in body.page).toBe(true)
  }, TEST_TIMEOUT)

  it('X-Request-Id header always present in success response', async () => {
    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/files'), testEnv)
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
  }, TEST_TIMEOUT)

  it('X-Request-Id header always present in error response', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files?sort_by=foo'),
      testEnv
    )
    expect(res.status).toBe(400)
    expect(res.headers.get('X-Request-Id')).toBeTruthy()
  }, TEST_TIMEOUT)

  it('valid X-Request-Id is echoed back', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files', {
        headers: { 'X-Request-Id': 'my-trace-123' },
      }),
      testEnv
    )
    expect(res.headers.get('X-Request-Id')).toBe('my-trace-123')
  }, TEST_TIMEOUT)

  it('invalid X-Request-Id (bad chars) → new UUID generated', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files', {
        headers: { 'X-Request-Id': 'bad id\n' },
      }),
      testEnv
    )
    const returned = res.headers.get('X-Request-Id')
    expect(returned).toBeTruthy()
    expect(returned).not.toBe('bad id\n')
    // Should be a UUID
    expect(returned).toMatch(/^[0-9a-f-]{36}$/)
  }, TEST_TIMEOUT)

  it('X-Request-Id > 128 chars → new UUID generated', async () => {
    const longId = 'a'.repeat(129)
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files', {
        headers: { 'X-Request-Id': longId },
      }),
      testEnv
    )
    const returned = res.headers.get('X-Request-Id')
    expect(returned).not.toBe(longId)
    expect(returned).toMatch(/^[0-9a-f-]{36}$/)
  }, TEST_TIMEOUT)

  it('cursor from previous response returns next page', async () => {
    // Insert 5 files
    for (let i = 0; i < 5; i++) {
      await insertFile({ id: `page-${i}`, created_at: 1_700_000_000 + i })
    }

    const app = buildApp()
    const res1 = await app.fetch(
      new Request('http://localhost/v2/files?limit=3'),
      testEnv
    )
    expect(res1.status).toBe(200)
    const body1 = await res1.json<{ items: unknown[]; page: { limit: number; next_cursor: string | null } }>()
    expect(body1.items).toHaveLength(3)
    expect(body1.page.next_cursor).toBeTruthy()

    const res2 = await app.fetch(
      new Request(`http://localhost/v2/files?limit=3&cursor=${encodeURIComponent(body1.page.next_cursor!)}`),
      testEnv
    )
    expect(res2.status).toBe(200)
    const body2 = await res2.json<{ items: unknown[]; page: { limit: number; next_cursor: string | null } }>()
    expect(body2.items).toHaveLength(2)
  }, TEST_TIMEOUT)

  it('cursor with changed filters → 400 cursor_invalid', async () => {
    await insertFile({ id: 'cf-001' })
    await insertFile({ id: 'cf-002' })

    const app = buildApp()
    // Get a cursor for sort_by=created_at
    const res1 = await app.fetch(
      new Request('http://localhost/v2/files?limit=1'),
      testEnv
    )
    const body1 = await res1.json<{ page: { next_cursor: string | null } }>()
    expect(body1.page.next_cursor).toBeTruthy()

    // Use cursor but change sort_by
    const res2 = await app.fetch(
      new Request(`http://localhost/v2/files?limit=1&sort_by=size&cursor=${encodeURIComponent(body1.page.next_cursor!)}`),
      testEnv
    )
    expect(res2.status).toBe(400)
    const body2 = await res2.json<{ error: { code: string; request_id: string } }>()
    expect(body2.error.code).toBe('cursor_invalid')
    expect(body2.error.request_id).toBeTruthy()
  }, TEST_TIMEOUT)

  it('manually forged cursor → 400 cursor_invalid', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files?cursor=forged.invalidsig'),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('cursor_invalid')
  }, TEST_TIMEOUT)

  it('?search= 101 chars → 400 search_too_long', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request(`http://localhost/v2/files?search=${'x'.repeat(101)}`),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json<{ error: { code: string } }>()
    expect(body.error.code).toBe('search_too_long')
  }, TEST_TIMEOUT)

  it('?sort_by=foo → 400 validation_error with details', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files?sort_by=foo'),
      testEnv
    )
    expect(res.status).toBe(400)
    const body = await res.json<{ error: { code: string; details: unknown } }>()
    expect(body.error.code).toBe('validation_error')
    expect(Array.isArray(body.error.details)).toBe(true)
  }, TEST_TIMEOUT)

  it('response items do not contain storage_key or bucket', async () => {
    await insertFile({ id: 'sec-001' })

    const app = buildApp()
    const res = await app.fetch(new Request('http://localhost/v2/files'), testEnv)
    const body = await res.json<{ items: Record<string, unknown>[] }>()
    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect('storage_key' in item).toBe(false)
      expect('bucket' in item).toBe(false)
    }
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// Auth regression: without auth context → 401
// The auth middleware runs outside the v2 sub-app (in the outer Hono app),
// so the outer app's onError handles it — not v2ErrorHandler.
// We verify the route is protected (401) via the worker.e2e.test.ts pattern.
// Here we just confirm the v2ErrorHandler maps HTTPException to V2 shape
// when thrown INSIDE the sub-app.
// ---------------------------------------------------------------------------
describe('GET /v2/files — HTTPException inside sub-app → V2ErrorResponse', () => {
  it('HTTPException(401) thrown inside v2 sub-app → V2ErrorResponse shape', async () => {
    const { HTTPException } = await import('hono/http-exception')
    const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
    // Throw inside the sub-app by adding middleware to v2 before routes
    // We simulate this by mounting a route that throws
    const testV2 = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
    const { v2RequestIdGuard } = await import('../../../src/middleware/v2RequestIdGuard')
    const { v2ErrorHandler } = await import('../../../src/middleware/v2Errors')
    testV2.use('*', v2RequestIdGuard)
    testV2.onError(v2ErrorHandler)
    testV2.get('/files', () => { throw new HTTPException(401, { message: 'Unauthorized' }) })
    app.route('/v2', testV2)

    const res = await app.fetch(new Request('http://localhost/v2/files'), testEnv)
    expect(res.status).toBe(401)
    const body = await res.json<{ error: { code: string; request_id: string } }>()
    expect(body.error.code).toBe('unauthorized')
    expect(body.error.request_id).toBeTruthy()
  }, TEST_TIMEOUT)
})

// ---------------------------------------------------------------------------
// Bulk-* regression (handlers moved to files.legacy.ts)
// ---------------------------------------------------------------------------
describe('bulk-* regression', () => {
  beforeAll(async () => {
    // Migrations already applied in the GET /v2/files suite above, but
    // applyD1Migrations is idempotent so safe to call again.
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    await clearFiles()
    await insertFile({ id: 'bulk-001' })
    await insertFile({ id: 'bulk-002' })
    await insertFile({ id: 'bulk-003', is_trashed: 1 })
  }, TEST_TIMEOUT)

  function buildBulkApp() {
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

  it('POST /v2/files/bulk-trash → 200', async () => {
    const app = buildBulkApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files/bulk-trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['bulk-001'] }),
      }),
      testEnv
    )
    expect(res.status).toBe(200)
    const body = await res.json<{ success: boolean; processed_count: number }>()
    expect(body.success).toBe(true)
    expect(body.processed_count).toBe(1)
  }, TEST_TIMEOUT)

  it('POST /v2/files/bulk-restore → 200', async () => {
    const app = buildBulkApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files/bulk-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['bulk-003'] }),
      }),
      testEnv
    )
    expect(res.status).toBe(200)
    const body = await res.json<{ success: boolean; processed_count: number }>()
    expect(body.success).toBe(true)
    expect(body.processed_count).toBe(1)
  }, TEST_TIMEOUT)

  it('POST /v2/files/bulk-move → 200', async () => {
    const app = buildBulkApp()
    const res = await app.fetch(
      new Request('http://localhost/v2/files/bulk-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ['bulk-001'], folder_id: null }),
      }),
      testEnv
    )
    expect(res.status).toBe(200)
    const body = await res.json<{ success: boolean; processed_count: number }>()
    expect(body.success).toBe(true)
    expect(body.processed_count).toBe(1)
  }, TEST_TIMEOUT)
})
