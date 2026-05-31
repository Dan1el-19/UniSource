import { exports } from 'cloudflare:workers'
import { describe, expect, it, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'

const TEST_TIMEOUT_MS = 15000

const workerExports = exports as typeof exports & {
  default: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  }
}

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

describe('V2 negotiation and tracing', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT_MS)

  it('returns V2 error envelope and X-Request-Id for unauthenticated /v2 requests', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/files', {
        headers: { 'X-Service-ID': 'default' },
      }),
    )

    expect(res.status).toBe(401)
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const body = await res.json() as { error?: { code?: string; request_id?: string } }
    expect(body.error?.code).toBe('unauthorized')
    expect(body.error?.request_id).toBe(res.headers.get('X-Request-Id'))
  }, TEST_TIMEOUT_MS)

  it('keeps legacy auth error shape when V2 is not requested on shared routes', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/my-files', {
        headers: { 'X-Service-ID': 'default' },
      }),
    )

    expect(res.status).toBe(401)
    const body = await res.json() as { error?: unknown; message?: unknown }
    expect(body).toMatchObject({ error: 'Unauthorized', message: 'Missing or invalid credentials' })
  }, TEST_TIMEOUT_MS)

  it('keeps stable routes on the legacy contract when V2 headers are sent', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/my-files', {
        headers: {
          'X-Service-ID': 'default',
          'X-Unisource-API-Version': '2',
          Accept: 'application/vnd.unisource.v2+json',
        },
      }),
    )

    expect(res.status).toBe(401)
    expect(res.headers.get('X-Request-Id')).toBeNull()
    const body = await res.json() as { error?: unknown; message?: unknown }
    expect(body).toMatchObject({ error: 'Unauthorized', message: 'Missing or invalid credentials' })
  }, TEST_TIMEOUT_MS)

  it('preserves the stable default service fallback when X-Service-ID is absent', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/my-files'),
    )

    expect(res.status).toBe(401)
    expect(res.headers.get('X-Request-Id')).toBeNull()
    const body = await res.json() as { error?: unknown; message?: unknown }
    expect(body).toMatchObject({ error: 'Unauthorized', message: 'Missing or invalid credentials' })
  }, TEST_TIMEOUT_MS)

  it('returns V2 auth error shape on V2 paths', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/my-files', {
        headers: { 'X-Service-ID': 'default' },
      }),
    )

    expect(res.status).toBe(401)
    const body = await res.json() as { error?: { code?: string; request_id?: string } }
    expect(body.error?.code).toBe('unauthorized')
    expect(body.error?.request_id).toBe(res.headers.get('X-Request-Id'))
  }, TEST_TIMEOUT_MS)
})
