import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { cfAccessMiddleware } from '../../src/middleware/cfAccess'

function buildStableApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', cfAccessMiddleware as never)
  app.get('/superadmin/services', (c) => c.json({ ok: true }))
  return app
}

describe('cfAccessMiddleware stable compatibility', () => {
  it('returns the legacy auth error shape on stable superadmin routes', async () => {
    const env = {
      CF_ACCESS_AUD: 'aud',
      CF_ACCESS_TEAM: 'team.example.com',
    } as unknown as CloudflareBindings

    const res = await buildStableApp().fetch(new Request('https://api.test/superadmin/services'), env)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({
      error: 'Unauthorized',
      message: 'Missing Cloudflare Access token',
    })
  })
})
