/**
 * Route tests for /v2/files and /v2/folders API-key access with X-Target-User-ID.
 */
import { exports } from 'cloudflare:workers'
import { describe, expect, it, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { hashApiKey } from '../../../src/db/v1/apiKeys'

const TEST_TIMEOUT = 15000

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

async function seedApiKey(name: string, plainKey: string, permissions: string[]) {
  const hash = await hashApiKey(plainKey)
  const prefix = plainKey.slice(0, 16)
  await env.APP_DB.prepare(`DELETE FROM api_keys WHERE name = ?`).bind(name).run()
  await env.APP_DB.prepare(
    `INSERT INTO api_keys (id, name, service_id, key_prefix, key_hash, permissions, is_account_level, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).bind(`id-${name}`, name, 'default', prefix, hash, JSON.stringify(permissions), Date.now()).run()
}

const NOW = 1_700_000_000

describe('/v2 API-key access', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
  }, TEST_TIMEOUT)

  it('requires X-Target-User-ID for API-key file listing', async () => {
    await seedApiKey('apikey-files-read', 'ak-read-123', ['files:read'])

    const res = await workerExports.default.fetch(new Request('https://api.test/v2/files', {
      headers: {
        Authorization: 'Bearer ak-read-123',
        'X-Service-ID': 'default',
      },
    }))

    expect(res.status).toBe(400)
    const body = await res.json() as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe('validation_error')
    expect(body.error?.message).toContain('X-Target-User-ID')
  }, TEST_TIMEOUT)

  it('lists target user files when API key has files:read', async () => {
    await seedApiKey('apikey-files-read', 'ak-read-123', ['files:read'])
    await env.APP_DB.prepare(
      `INSERT OR IGNORE INTO files (
        id, user_id, service_id, folder_id, upload_id, filename, size, mime_type,
        storage_destination, storage_key, bucket, is_trashed, trashed_at, is_main_storage,
        created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'r2', ?, 'primary', 0, NULL, 0, ?, ?)`
    ).bind('file-a', 'user-a', 'default', 'test.txt', 100, 'text/plain', 'key-file-a', NOW, NOW).run()

    const res = await workerExports.default.fetch(new Request('https://api.test/v2/files', {
      headers: {
        Authorization: 'Bearer ak-read-123',
        'X-Service-ID': 'default',
        'X-Target-User-ID': 'user-a',
      },
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { items?: Array<{ id: string }> }
    expect(body.items?.map((item) => item.id)).toContain('file-a')
  }, TEST_TIMEOUT)

  it('lists target user folders when API key has files:read', async () => {
    await seedApiKey('apikey-folders-read', 'ak-folders-123', ['files:read'])
    await env.APP_DB.prepare(
      `INSERT OR IGNORE INTO folders (id, user_id, service_id, parent_id, name, color_tag, is_trashed, trashed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind('folder-a', 'user-a', 'default', null, 'docs', '', 0, null, NOW, NOW).run()

    const res = await workerExports.default.fetch(new Request('https://api.test/v2/folders', {
      headers: {
        Authorization: 'Bearer ak-folders-123',
        'X-Service-ID': 'default',
        'X-Target-User-ID': 'user-a',
      },
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { items?: Array<{ id: string }> }
    expect(body.items?.map((item) => item.id)).toContain('folder-a')
  }, TEST_TIMEOUT)
})
