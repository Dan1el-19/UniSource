import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { canWriteMainStorage } from '../../src/middleware/mainStorageGuard'

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('authType', 'apikey')
    c.set('isAdmin', false)
    c.set('apiKeyPermissions', ['upload'])
    await next()
  })
  app.get('/upload/*', (c) => c.json({ allowed: canWriteMainStorage(c) }))
  app.get('/v2/upload/*', (c) => c.json({ allowed: canWriteMainStorage(c, true) }))
  return app
}

describe('canWriteMainStorage stable compatibility', () => {
  it('allows stable API keys without the newer V2 permission check', async () => {
    const res = await buildApp().request('/upload/r2/init')
    await expect(res.json()).resolves.toEqual({ allowed: true })
  })

  it('requires an explicit permission from V2 API keys', async () => {
    const res = await buildApp().request('/v2/upload/r2/init')
    await expect(res.json()).resolves.toEqual({ allowed: false })
  })
})
