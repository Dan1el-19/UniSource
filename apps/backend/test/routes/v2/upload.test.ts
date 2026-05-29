import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import upload from '../../../src/routes/upload'
import { V2Error, errorResponse } from '../../../src/lib/v2/errors'
import type { ServiceRecord } from '../../../src/db/services'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000

const SERVICE_ID = 'svc-test'
const USER_ID = 'user-test'

const TEST_SERVICE: ServiceRecord = {
  id: SERVICE_ID,
  name: 'svc-test',
  default_bucket: 'primary',
  max_storage_bytes: 100_000_000,
  current_used_bytes: 0,
  main_used_bytes: 0,
  max_file_size_bytes: 100_000_000,
  recommended_upload_destination: 'r2',
  object_key_prefix: 'svc-test',
  created_at: 0,
}

// Augment Workers env with R2 bucket name mapping required by r2 sigv4 helpers.
const testEnv = () =>
  ({
    ...env,
    R2_BUCKET_NAMES: JSON.stringify({ primary: 'storage-primary-test' }),
  }) as unknown as CloudflareBindings

function buildApp(opts?: { userId?: string; serviceRole?: 'user' | 'plus' | 'admin' | 'system' }) {
  const userId = opts?.userId ?? USER_ID
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set(
      'authType',
      (userId === 'system' ? 'apikey' : 'appwrite') as WorkerVariables['authType']
    )
    c.set('apiKeyPermissions', ['upload'])
    c.set('serviceRole', (opts?.serviceRole ?? 'user') as WorkerVariables['serviceRole'])
    c.set('isAdmin', (opts?.serviceRole === 'admin') as WorkerVariables['isAdmin'])
    c.set('service', TEST_SERVICE)
    c.set('requestId', 'req-test')
    await next()
  })
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err)
    throw err
  })
  app.route('/upload', upload)
  return app
}

beforeAll(async () => {
  await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.APP_DB.prepare('DELETE FROM uploads').run()
  await env.APP_DB.prepare('DELETE FROM files').run()
  await env.APP_DB.prepare(
    `INSERT OR REPLACE INTO services
       (id, name, default_bucket, max_storage_bytes, current_used_bytes, max_file_size_bytes, object_key_prefix, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      SERVICE_ID,
      'svc-test',
      'primary',
      TEST_SERVICE.max_storage_bytes,
      0,
      TEST_SERVICE.max_file_size_bytes,
      'svc-test',
      0
    )
    .run()
})

describe('POST /upload/r2/init — V2 envelope', () => {
  it(
    'returns { item } envelope with presigned_url + storage_key on success',
    async () => {
      const app = buildApp()
      const res = await app.fetch(
        new Request('http://localhost/upload/r2/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'a.bin',
            size: 1024,
            mime_type: 'application/octet-stream',
          }),
        }),
        testEnv()
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        item: { upload_id: string; destination: string; presigned_url: string }
      }
      expect(body.item.destination).toBe('r2')
      expect(body.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(body.item.presigned_url).toMatch(/^https:\/\//)
    },
    TEST_TIMEOUT
  )

  it('returns V2 error envelope (validation_error) for invalid body', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: '', size: 'not-a-number' }),
      }),
      testEnv()
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; request_id: string } }
    expect(body.error.code).toBe('validation_error')
    expect(body.error.request_id).toBe('req-test')
  })

  it('returns 413 with file_too_large code when size exceeds service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'huge.bin',
          size: 999_999_999_999,
          mime_type: 'application/octet-stream',
        }),
      }),
      testEnv()
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as {
      error: { code: string; details?: { max_bytes: number } }
    }
    expect(body.error.code).toBe('file_too_large')
    expect(body.error.details?.max_bytes).toBe(100_000_000)
  })

  it('returns 403 with forbidden code when non-admin requests is_main_storage', async () => {
    const app = buildApp({ serviceRole: 'user' })
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'a.bin',
          size: 1024,
          mime_type: 'application/octet-stream',
          is_main_storage: true,
        }),
      }),
      testEnv()
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('forbidden')
  })
})

describe('POST /upload/appwrite/init — V2 envelope', () => {
  it(
    'returns { item } envelope with appwrite_endpoint + file_id on success',
    async () => {
      const app = buildApp()
      const res = await app.fetch(
        new Request('http://localhost/upload/appwrite/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'a.bin',
            size: 1024,
            mime_type: 'application/octet-stream',
          }),
        }),
        testEnv()
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        item: { destination: string; appwrite_endpoint: string; file_id: string }
      }
      expect(body.item.destination).toBe('appwrite')
      expect(body.item.appwrite_endpoint).toMatch(/^https:\/\//)
      expect(body.item.file_id).toMatch(/^[0-9a-f-]{36}$/)
    },
    TEST_TIMEOUT
  )

  it('omits jwt field when caller has no appwriteJwt context (api key path)', async () => {
    const app = buildApp({ userId: 'system' })
    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'a.bin',
          size: 1024,
          mime_type: 'application/octet-stream',
        }),
      }),
      testEnv()
    )
    const body = (await res.json()) as { item: { jwt?: string } }
    expect(body.item.jwt).toBeUndefined()
  })

  it('returns 413 file_too_large for size exceeding service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'a.bin',
          size: 999_999_999_999,
          mime_type: 'application/octet-stream',
        }),
      }),
      testEnv()
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('file_too_large')
  })
})

describe('POST /upload/complete — V2 envelope (no-storage paths)', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'nonexistent' }),
      }),
      testEnv()
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 410 gone when upload TTL expired', async () => {
    const expiredId = 'upload-expired'
    await env.APP_DB.prepare(
      `INSERT INTO uploads (id, service_id, user_id, folder_id, filename, size, mime_type,
         destination, storage_key, bucket, presigned_url, expires_at, status, is_main_storage,
         created_at, updated_at, upload_type, r2_upload_id)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, 'r2', ?, 'primary', NULL, ?, 'pending', 0, 0, 0, 'single', NULL)`
    )
      .bind(expiredId, SERVICE_ID, 'a.bin', 1024, 'application/octet-stream', 'svc-test/key', 1)
      .run()

    const app = buildApp({ userId: 'system' })
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: expiredId }),
      }),
      testEnv()
    )
    expect(res.status).toBe(410)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('gone')
  })

  it('returns 400 validation_error for missing upload_id', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      testEnv()
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })
})

describe('POST /upload/r2/multipart/create — V2 envelope', () => {
  it(
    'returns { item } envelope with r2_upload_id + key on success',
    async () => {
      const app = buildApp()
      const res = await app.fetch(
        new Request('http://localhost/upload/r2/multipart/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'big.bin',
            size: 50_000_000,
            mime_type: 'application/octet-stream',
          }),
        }),
        testEnv()
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        item: { upload_id: string; r2_upload_id: string; key: string; bucket: string }
      }
      expect(body.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(body.item.r2_upload_id).toBeTruthy()
      expect(body.item.key).toContain('svc-test/')
    },
    TEST_TIMEOUT
  )

  it('returns 413 file_too_large when size exceeds service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'huge.bin',
          size: 999_999_999_999,
          mime_type: 'application/octet-stream',
        }),
      }),
      testEnv()
    )
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('file_too_large')
  })
})

describe('GET /upload/r2/multipart/sign-part — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request(
        'http://localhost/upload/r2/multipart/sign-part?upload_id=nonexistent&part_number=1',
        { method: 'GET' }
      ),
      testEnv()
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 400 validation_error when part_number out of range', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request(
        'http://localhost/upload/r2/multipart/sign-part?upload_id=abc&part_number=99999',
        { method: 'GET' }
      ),
      testEnv()
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })
})

describe('GET /upload/r2/multipart/list-parts — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/list-parts?upload_id=nonexistent', {
        method: 'GET',
      }),
      testEnv()
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })
})

describe('POST /upload/r2/multipart/complete — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: 'nonexistent',
          parts: [{ PartNumber: 1, ETag: 'etag1' }],
        }),
      }),
      testEnv()
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 400 validation_error for empty parts array', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'abc', parts: [] }),
      }),
      testEnv()
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })
})

describe('DELETE /upload/r2/multipart/abort — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/abort', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'nonexistent' }),
      }),
      testEnv()
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })
})
