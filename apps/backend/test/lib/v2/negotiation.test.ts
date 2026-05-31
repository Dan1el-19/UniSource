import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { wantsV2 } from '../../../src/lib/v2/negotiation'

function buildApp() {
  const app = new Hono()
  app.get('*', (c) => c.json({ wants_v2: wantsV2(c) }))
  return app
}

describe('wantsV2', () => {
  it('uses only the /v2 URL family to select the V2 contract', async () => {
    const app = buildApp()
    const stableWithVersionHeader = await app.request('/my-files', {
      headers: { 'X-Unisource-API-Version': '2' },
    })
    const stableWithAcceptHeader = await app.request('/folders', {
      headers: { Accept: 'application/vnd.unisource.v2+json' },
    })
    const legacySuperadmin = await app.request('/superadmin/services')
    const v2 = await app.request('/v2/my-files')

    await expect(stableWithVersionHeader.json()).resolves.toEqual({ wants_v2: false })
    await expect(stableWithAcceptHeader.json()).resolves.toEqual({ wants_v2: false })
    await expect(legacySuperadmin.json()).resolves.toEqual({ wants_v2: false })
    await expect(v2.json()).resolves.toEqual({ wants_v2: true })
  })
})
