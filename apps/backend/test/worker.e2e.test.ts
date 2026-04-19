import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const TEST_TIMEOUT_MS = 15000

const workerExports = exports as typeof exports & {
  default: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  }
}

describe('app-backend worker', () => {
  it('serves the health route', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/health'))
    const payload = await response.json<{ status: string; timestamp: number }>()

    expect(response.status).toBe(200)
    expect(payload.status).toBe('ok')
    expect(typeof payload.timestamp).toBe('number')
  }, TEST_TIMEOUT_MS)

  it('protects upload routes with bearer auth', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/upload/r2/init'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    })
  }, TEST_TIMEOUT_MS)

  it('protects files routes with bearer auth', async () => {
    const response = await workerExports.default.fetch(new Request('http://localhost/files'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    })
  }, TEST_TIMEOUT_MS)
})