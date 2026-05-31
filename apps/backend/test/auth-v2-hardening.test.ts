import { exports } from 'cloudflare:workers'
import { describe, expect, it, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { hashApiKey } from '../src/db/v1/apiKeys'

const TEST_TIMEOUT_MS = 15000

const workerExports = exports as typeof exports & {
  default: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }
}

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

describe('auth hardening', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT_MS)

  it('rejects authenticated routes without X-Service-ID', async () => {
    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/my-files'),
    )

    expect(res.status).toBe(400)
    const body = await res.json() as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe('validation_error')
    expect(body.error?.message).toContain('X-Service-ID')
  }, TEST_TIMEOUT_MS)

  it('stores API-key permissions on request context', async () => {
    const apiKeyPlain = 'test-api-key-hardening-3'
    const apiKeyHash = await hashApiKey(apiKeyPlain)
    await env.APP_DB.prepare(
      `DELETE FROM api_keys WHERE name = 'auth-test-key'`
    ).run()
    await env.APP_DB.prepare(
      `INSERT INTO api_keys (id, name, service_id, key_prefix, key_hash, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('key-test-3', 'auth-test-key', 'default', apiKeyPlain.slice(0, 16), apiKeyHash, JSON.stringify(['files:read']), Date.now()).run()

    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/admin/service', {
        headers: {
          Authorization: `Bearer ${apiKeyPlain}`,
          'X-Service-ID': 'default',
        },
      }),
    )

    expect(res.status).toBe(403)
    const body = await res.json() as { error?: { code?: string } }
    expect(body.error?.code).toBe('forbidden')
  }, TEST_TIMEOUT_MS)

  it('denies non-admin API keys on admin-only routes', async () => {
    const apiKeyPlain = 'non-admin-key-h4'
    const apiKeyHash = await hashApiKey(apiKeyPlain)
    await env.APP_DB.prepare(`DELETE FROM api_keys WHERE name = 'non-admin-key'`).run()
    await env.APP_DB.prepare(
      `INSERT INTO api_keys (id, name, service_id, key_prefix, key_hash, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind('key-nonadmin', 'non-admin-key', 'default', apiKeyPlain.slice(0, 16), apiKeyHash, JSON.stringify(['files:read']), Date.now()).run()

    for (const path of ['/v2/admin/service', '/v2/main/999', '/v2/releases/999']) {
      const res = await workerExports.default.fetch(
        new Request(`https://api.test${path}`, {
          headers: {
            Authorization: `Bearer ${apiKeyPlain}`,
            'X-Service-ID': 'default',
          },
        }),
      )

      expect(res.status).toBe(403)
      const body = await res.json() as { error?: { code?: string } }
      expect(body.error?.code).toBe('forbidden')
    }
  }, TEST_TIMEOUT_MS)

  it('allows files:read API keys with X-Target-User-ID', async () => {
    const apiKeyPlain = 'preview-key-h4'
    const apiKeyHash = await hashApiKey(apiKeyPlain)
    await env.APP_DB.prepare(`DELETE FROM api_keys WHERE name = 'preview-key'`).run()
    await env.APP_DB.prepare(
      `INSERT INTO api_keys (id, name, service_id, key_prefix, key_hash, permissions, is_account_level, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind('key-preview', 'preview-key', 'default', apiKeyPlain.slice(0, 16), apiKeyHash, JSON.stringify(['files:read']), Date.now()).run()

    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/files', {
        headers: {
          Authorization: `Bearer ${apiKeyPlain}`,
          'X-Service-ID': 'default',
          'X-Target-User-ID': 'user-a',
        },
      }),
    )

    expect(res.status).toBe(200)
  }, TEST_TIMEOUT_MS)

  it('denies X-Target-User-ID without files:read permission', async () => {
    const apiKeyPlain = 'preview-key-h5'
    const apiKeyHash = await hashApiKey(apiKeyPlain)
    await env.APP_DB.prepare(`DELETE FROM api_keys WHERE name = 'preview-key-noread'`).run()
    await env.APP_DB.prepare(
      `INSERT INTO api_keys (id, name, service_id, key_prefix, key_hash, permissions, is_account_level, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).bind('key-preview2', 'preview-key-noread', 'default', apiKeyPlain.slice(0, 16), apiKeyHash, JSON.stringify(['upload']), Date.now()).run()

    const res = await workerExports.default.fetch(
      new Request('https://api.test/v2/files', {
        headers: {
          Authorization: `Bearer ${apiKeyPlain}`,
          'X-Service-ID': 'default',
          'X-Target-User-ID': 'user-a',
        },
      }),
    )

    expect(res.status).toBe(403)
  }, TEST_TIMEOUT_MS)
})
