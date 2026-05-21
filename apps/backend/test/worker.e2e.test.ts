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

describe('app-backend worker', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT_MS)

  it('serves the health route', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/health'))
    const payload = await response.json<{ status: string; timestamp: number }>()

    expect(response.status).toBe(200)
    expect(payload.status).toBe('ok')
    expect(typeof payload.timestamp).toBe('number')
  }, TEST_TIMEOUT_MS)

  it('rejects unknown service ID', async () => {
    const response = await workerExports.default.fetch(
      new Request('http://localhost/upload/r2/init', {
        headers: { 'X-Service-ID': 'nonexistent-service' },
      })
    )
    expect(response.status).toBe(400)
    const payload = await response.json<{ error: string; message: string }>()
    expect(payload.error).toBe('Bad Request')
    expect(payload.message).toContain('Unknown service')
  }, TEST_TIMEOUT_MS)

  it('protects upload routes — returns 401 without credentials', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/upload/r2/init'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  }, TEST_TIMEOUT_MS)

  it('protects files routes — returns 401 without credentials', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/files'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  }, TEST_TIMEOUT_MS)

  it('protects folders routes — returns 401 without credentials', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/folders'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  }, TEST_TIMEOUT_MS)

  it('protects my-files routes — returns 401 without credentials', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/my-files'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  }, TEST_TIMEOUT_MS)

  it('protects admin routes — returns 401 without credentials', async () => {
    const adminRoutes = [
      'http://localhost/admin/service',
      'http://localhost/admin/service/usage',
      'http://localhost/admin/audit-log',
    ]
    for (const url of adminRoutes) {
      const response = await workerExports.default.fetch(new Request(url))
      expect(response.status, `expected 401 for ${url}`).toBe(401)
      expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
    }
  }, TEST_TIMEOUT_MS)

  it('PATCH /my-files/:id returns 401 without credentials', async () => {
    const response = await workerExports.default.fetch(
      new Request('http://localhost/my-files/some-file-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'new-name.pdf' }),
      })
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'Unauthorized' })
  }, TEST_TIMEOUT_MS)
})
