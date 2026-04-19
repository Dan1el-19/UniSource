import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const TEST_TIMEOUT_MS = 15000

const workerExports = exports as typeof exports & {
  default: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    scheduled: (event: any, env: any, ctx: any) => Promise<void>;
  }
}

describe('Scheduled Worker (Cron) - Orphaned Uploads', () => {
  it('runs without throwing errors when no orphans exist', async () => {
    // We cannot easily seed D1 from unit tests unless we expose a TRUNCATE/INSERT helper,
    // but we can ensure the cron runs successfully on an empty or existing state.
    const mockCtx = {
      waitUntil: (p: Promise<any>) => p
    }
    
    // We trigger the default scheduled export
    await expect(
      workerExports.default.scheduled({ cron: '0 * * * *', type: 'cron', scheduledTime: Date.now() }, process.env as any, mockCtx)
    ).resolves.toBeUndefined();
  }, TEST_TIMEOUT_MS)
})
