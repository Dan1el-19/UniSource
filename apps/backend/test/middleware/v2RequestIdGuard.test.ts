import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { v2RequestIdGuard } from '../../src/middleware/v2RequestIdGuard'

const VALID_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function makeApp() {
  const app = new Hono<{ Variables: { requestId: string } }>()
  app.use('*', v2RequestIdGuard)
  app.get('/', (c) => c.json({ requestId: c.var.requestId }))
  return app
}

describe('v2RequestIdGuard', () => {
  it('passes through a valid X-Request-Id', async () => {
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': 'trace-abc-123' },
    })
    expect(res.headers.get('X-Request-Id')).toBe('trace-abc-123')
    const body = await res.json() as { requestId: string }
    expect(body.requestId).toBe('trace-abc-123')
  })

  it('replaces value > 128 chars', async () => {
    const longId = 'a'.repeat(200)
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': longId },
    })
    expect(res.headers.get('X-Request-Id')).toMatch(VALID_UUID_PATTERN)
  })

  it('replaces value < 8 chars', async () => {
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': 'abc' },
    })
    expect(res.headers.get('X-Request-Id')).toMatch(VALID_UUID_PATTERN)
  })

  it('replaces value with disallowed chars (spaces)', async () => {
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': 'has spaces inside' },
    })
    expect(res.headers.get('X-Request-Id')).toMatch(VALID_UUID_PATTERN)
  })

  it('generates UUID when no header present', async () => {
    const res = await makeApp().request('/')
    expect(res.headers.get('X-Request-Id')).toMatch(VALID_UUID_PATTERN)
  })

  it('accepts valid characters: A-Za-z0-9._:-', async () => {
    const valid = 'AbC.def-123:xyz'
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': valid },
    })
    expect(res.headers.get('X-Request-Id')).toBe(valid)
  })

  it('sets c.var.requestId for downstream handlers', async () => {
    const res = await makeApp().request('/', {
      headers: { 'X-Request-Id': 'downstream-test-ok' },
    })
    const body = await res.json() as { requestId: string }
    expect(body.requestId).toBe('downstream-test-ok')
  })
})
