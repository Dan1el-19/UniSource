/**
 * End-to-end smoke test for GET /v2/files pagination.
 *
 * Seeds 75 files, then uses UnisourceV2Client to paginate through 3 pages
 * (limit=25 per page). Verifies:
 * - No duplicate IDs across pages
 * - Total count matches seeded files
 * - Cursor encode/decode works correctly
 */
import { Hono } from 'hono'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import v2Router from '../../src/routes/v2/index'
import { UnisourceV2Client } from '@unisource/sdk/v2'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 30000
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!'
const SERVICE_ID = 'smoke-svc'
const USER_ID = 'smoke-user'
const TOTAL_FILES = 75
const PAGE_LIMIT = 25

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

async function seedFiles() {
  const now = Math.floor(Date.now() / 1000)
  for (let i = 0; i < TOTAL_FILES; i++) {
    await env.APP_DB.prepare(
      `INSERT INTO files (
         id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
         storage_destination, storage_key, bucket, is_trashed, trashed_at,
         created_at, updated_at, is_main_storage
       ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'r2', ?, 'primary', 0, NULL, ?, ?, 0)`
    )
      .bind(
        `file-${i.toString().padStart(3, '0')}`,
        SERVICE_ID,
        USER_ID,
        `smoke-file-${i}.txt`,
        1024 + i,
        'text/plain',
        `key-${i}`,
        now + i,
        now + i
      )
      .run()
  }
}

describe('GET /v2/files — end-to-end pagination', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
    await seedFiles()
  }, TEST_TIMEOUT)

  it(
    'paginates through 3 pages with no duplicates',
    async () => {
      const app = buildApp()

      // Create a test client that calls the app directly
      const client = new UnisourceV2Client({
        baseUrl: 'http://localhost',
        serviceId: SERVICE_ID,
        getToken: () => null,
        silentBeta: true,
      })

      // Override fetch to use the app
      const originalFetch = globalThis.fetch
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init)
        return app.fetch(req, {
          APP_DB: env.APP_DB,
          CURSOR_HMAC_SECRET: HMAC_SECRET,
        } as unknown as CloudflareBindings)
      }

      try {
        const allIds = new Set<string>()
        let cursor: string | undefined
        let pageCount = 0

        // Paginate through all pages
        for (let page = 0; page < 3; page++) {
          const response = await client.files.list({
            limit: PAGE_LIMIT,
            ...(cursor ? { cursor } : {}),
          })

          pageCount++
          expect(response.items.length).toBeLessThanOrEqual(PAGE_LIMIT)

          // Check for duplicates within this page
          const pageIds = response.items.map((f) => f.id)
          const pageDuplicates = pageIds.filter((id, idx) => pageIds.indexOf(id) !== idx)
          expect(pageDuplicates).toHaveLength(0)

          // Check for duplicates across pages
          for (const file of response.items) {
            expect(allIds.has(file.id)).toBe(false)
            allIds.add(file.id)
          }

          const nextCursor = response.page.next_cursor

          // Last page should have no next_cursor
          if (page === 2) {
            expect(nextCursor).toBeNull()
          } else {
            expect(nextCursor).toBeTruthy()
          }
          cursor = nextCursor ?? undefined
        }

        // Verify total count
        expect(allIds.size).toBe(TOTAL_FILES)
        expect(pageCount).toBe(3)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
    TEST_TIMEOUT
  )
})
