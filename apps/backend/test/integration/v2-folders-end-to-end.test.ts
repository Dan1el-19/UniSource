/**
 * End-to-end smoke test for GET /v2/folders pagination.
 *
 * Seeds 75 folders, then uses UnisourceV2Client to paginate through 3 pages
 * (limit=25 per page). Verifies:
 * - No duplicate IDs across pages
 * - Total count matches seeded folders
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
const TOTAL_FOLDERS = 75
const PAGE_LIMIT = 25

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()

  app.use('*', async (c, next) => {
    c.set('userId', USER_ID as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set('authType', 'apikey' as WorkerVariables['authType'])
    c.set('apiKeyPermissions', ['admin'])
    await next()
  })

  app.route('/v2', v2Router)
  return app
}

async function seedFolders() {
  const now = Math.floor(Date.now() / 1000)
  for (let i = 0; i < TOTAL_FOLDERS; i++) {
    await env.APP_DB.prepare(
      `INSERT INTO folders (
         id, service_id, user_id, parent_id, name, color_tag,
         is_trashed, trashed_at, created_at, updated_at
       ) VALUES (?, ?, ?, NULL, ?, NULL, 0, NULL, ?, ?)`
    )
      .bind(
        `folder-${i.toString().padStart(3, '0')}`,
        SERVICE_ID,
        USER_ID,
        `smoke-folder-${i}`,
        now + i,
        now + i
      )
      .run()
  }
}

describe('GET /v2/folders — end-to-end pagination', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
    await seedFolders()
  }, TEST_TIMEOUT)

  it(
    'paginates through 3 pages with no duplicates',
    async () => {
      const app = buildApp()

      const client = new UnisourceV2Client({
        baseUrl: 'http://localhost',
        serviceId: SERVICE_ID,
        getToken: () => null,
        silentBeta: true,
      })

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

        for (let page = 0; page < 3; page++) {
          const response = await client.folders.list({
            limit: PAGE_LIMIT,
            ...(cursor ? { cursor } : {}),
          })

          pageCount++
          expect(response.items.length).toBeLessThanOrEqual(PAGE_LIMIT)

          const pageIds = response.items.map((f) => f.id)
          const pageDuplicates = pageIds.filter((id, idx) => pageIds.indexOf(id) !== idx)
          expect(pageDuplicates).toHaveLength(0)

          for (const folder of response.items) {
            expect(allIds.has(folder.id)).toBe(false)
            allIds.add(folder.id)
          }

          const nextCursor = response.page.next_cursor

          if (page === 2) {
            expect(nextCursor).toBeNull()
          } else {
            expect(nextCursor).toBeTruthy()
          }
          cursor = nextCursor ?? undefined
        }

        expect(allIds.size).toBe(TOTAL_FOLDERS)
        expect(pageCount).toBe(3)
      } finally {
        globalThis.fetch = originalFetch
      }
    },
    TEST_TIMEOUT
  )
})
