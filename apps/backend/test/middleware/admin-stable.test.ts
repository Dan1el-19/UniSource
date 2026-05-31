import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireAdminMiddleware } from '../../src/middleware/admin'
import { V2Error, errorResponse } from '../../src/lib/v2/errors'

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('authType', 'apikey')
    c.set('isAdmin', false)
    c.set('apiKeyPermissions', ['files:read'])
    await next()
  })
  app.use('*', requireAdminMiddleware)
  app.get('/admin/service', (c) => c.json({ ok: true }))
  app.get('/v2/admin/service', (c) => c.json({ ok: true }))
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err)
    throw err
  })
  return app
}

describe('requireAdminMiddleware stable compatibility', () => {
  it('allows API keys on stable admin routes as main did', async () => {
    const res = await buildApp().request('/admin/service')
    expect(res.status).toBe(200)
  })

  it('requires admin permission from API keys on V2 admin routes', async () => {
    const res = await buildApp().request('/v2/admin/service')
    expect(res.status).toBe(403)
  })
})
