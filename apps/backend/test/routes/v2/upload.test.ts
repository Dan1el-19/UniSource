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
