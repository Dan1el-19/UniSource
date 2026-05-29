/**
 * End-to-end smoke test for V2 releases flow.
 *
 * Drives the releases routes via UnisourceV2Client (SDK) ↔ Hono backend over an
 * in-memory `globalThis.fetch` swap. Verifies the V2 envelope wire shape for:
 * - Single upload: uploadInit → uploadComplete
 * - Multipart upload: multipartCreate → multipartSignPart → multipartComplete
 * - Management: list, latest, get, update, delete
 * - Sync: bulk-style reconciliation
 *
 * R2 SDK calls and presigner are mocked so the test can run without external services.
 */
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { applyD1Migrations, env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { V2Error, errorResponse } from '../../src/lib/v2/errors'
import type { ServiceRecord } from '../../src/db/services'
import { UnisourceV2Client } from '@unisource/sdk/v2'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

vi.mock('../../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/r2')>()
  return {
    ...actual,
    headObject: vi.fn().mockResolvedValue({ size: 1024 }),
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://r2.example.com/put-presigned',
      storage_key: 'releases/svc-int/key',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }),
    signUploadPart: vi.fn().mockResolvedValue({
      url: 'https://r2.example.com/sign-part-1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    }),
    createMultipartUpload: vi
      .fn()
      .mockResolvedValue({ upload_id: 'r2-multipart-upload-id-abc' }),
    completeMultipartUpload: vi.fn().mockResolvedValue({ etag: 'final-etag' }),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    listUploadedParts: vi.fn().mockResolvedValue([]),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  }
})

const TEST_TIMEOUT = 30000
const SERVICE_ID = 'svc-int'
const USER_ID = 'user-int'

const TEST_SERVICE: ServiceRecord = {
  id: SERVICE_ID,
  name: 'svc-int',
  default_bucket: 'primary',
  max_storage_bytes: 100_000_000,
  current_used_bytes: 0,
  main_used_bytes: 0,
  max_file_size_bytes: 100_000_000,
  recommended_upload_destination: 'r2',
  object_key_prefix: 'svc-int',
  created_at: 0,
}

async function loadReleasesRouter() {
  const mod = await import('../../src/routes/releases')
  return mod.default
}

async function buildApp() {
  const releases = await loadReleasesRouter()
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', USER_ID as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set('authType', 'appwrite' as WorkerVariables['authType'])
    c.set('isAdmin', true as WorkerVariables['isAdmin'])
    c.set('service', TEST_SERVICE)
    c.set('requestId', 'req-int')
    await next()
  })
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err)
    throw err
  })
  app.route('/releases', releases)
  return app
}

const testEnv = () =>
  ({
    ...env,
    R2_BUCKET_NAMES: JSON.stringify({ primary: 'storage-primary-test' }),
  }) as unknown as CloudflareBindings

beforeAll(async () => {
  await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.APP_DB.prepare('DELETE FROM releases').run()
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO services
       (id, name, default_bucket, max_storage_bytes, current_used_bytes, max_file_size_bytes, object_key_prefix, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      SERVICE_ID,
      'svc-int',
      'primary',
      TEST_SERVICE.max_storage_bytes,
      0,
      TEST_SERVICE.max_file_size_bytes,
      'svc-int',
      0
    )
    .run()
})

function buildClientAndSwapFetch(app: Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>) {
  const client = new UnisourceV2Client({
    baseUrl: 'http://localhost',
    serviceId: SERVICE_ID,
    getToken: () => 'fake-token',
    silentBeta: true,
  })
  const originalFetch = globalThis.fetch
  const ctxs: ExecutionContext[] = []
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const ctx = createExecutionContext()
    ctxs.push(ctx)
    return app.fetch(req, testEnv(), ctx)
  }
  return {
    client,
    restore: async () => {
      for (const ctx of ctxs) await waitOnExecutionContext(ctx)
      globalThis.fetch = originalFetch
    },
  }
}

describe('V2 releases — end-to-end via SDK', () => {
  it(
    'single upload: uploadInit → uploadComplete returns V2 envelope shapes',
    async () => {
      const app = await buildApp()
      const { client, restore } = buildClientAndSwapFetch(app)

      try {
        const init = await client.releases.uploadInit({ name: 'v1.0.0', filename: 'app.zip', tags: ['stable'] })
        expect(init.item.release_id).toMatch(/^[0-9a-f-]{36}$/)
        expect(init.item.presigned_url).toMatch(/^https:\/\//)

        const completed = await client.releases.uploadComplete(init.item.release_id, 1024)
        expect(completed.item.status).toBe('completed')
        expect(completed.item.id).toBe(init.item.release_id)
      } finally {
        await restore()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'multipart upload: create → sign-part → complete returns V2 envelope shapes',
    async () => {
      const app = await buildApp()
      const { client, restore } = buildClientAndSwapFetch(app)

      try {
        const created = await client.releases.multipartCreate({ name: 'v2.0.0', filename: 'big.zip', mime_type: 'application/zip' })
        expect(created.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)

        const signed = await client.releases.multipartSignPart(created.item.upload_id, 1)
        expect(signed.item.url).toMatch(/^https:\/\//)

        const completed = await client.releases.multipartComplete(created.item.upload_id, [{ PartNumber: 1, ETag: 'etag-1' }])
        expect(completed.item.status).toBe('completed')
      } finally {
        await restore()
      }
    },
    TEST_TIMEOUT
  )

  it(
    'management: list, latest, get, update, delete, sync returns V2 shapes',
    async () => {
      const app = await buildApp()
      const { client, restore } = buildClientAndSwapFetch(app)

      try {
        const init = await client.releases.uploadInit({ name: 'v1.0.0', filename: 'app.zip' })
        await client.releases.uploadComplete(init.item.release_id, 1024)

        const listed = await client.releases.list({ limit: 10 })
        expect(listed.page.limit).toBe(10)
        expect(listed.items.length).toBeGreaterThanOrEqual(1)

        const latest = await client.releases.latest()
        expect(latest.item.upload_status).toBe('completed')

        const fetched = await client.releases.get(latest.item.id)
        expect(fetched.item.id).toBe(latest.item.id)

        const updated = await client.releases.update(latest.item.id, { notes: 'patched' })
        expect(updated.item.notes).toBe('patched')

        const synced = await client.releases.sync({ releases: [{ id: 'rel-sync', name: 'v3.0.0', r2_key: 'releases/svc-int/rel-sync.zip', size: 2048 }] })
        expect(synced.processed).toEqual(['rel-sync'])
        expect(synced.failed).toEqual([])

        const deleted = await client.releases.delete(latest.item.id)
        expect(deleted.item.deleted).toBe(true)
      } finally {
        await restore()
      }
    },
    TEST_TIMEOUT
  )
})
