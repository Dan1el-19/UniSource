import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('beta warning', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('warns on first construction', async () => {
    const { UnisourceV2Client } = await import('../../src/v2/client')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new UnisourceV2Client({ baseUrl: 'http://x', serviceId: 's', getToken: () => null })
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0]![0]).toContain('beta')
    spy.mockRestore()
  })

  it('does NOT warn on second construction', async () => {
    const { UnisourceV2Client } = await import('../../src/v2/client')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new UnisourceV2Client({ baseUrl: 'http://x', serviceId: 's', getToken: () => null })
    new UnisourceV2Client({ baseUrl: 'http://x', serviceId: 's', getToken: () => null })
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it('silentBeta suppresses warning', async () => {
    const { UnisourceV2Client } = await import('../../src/v2/client')
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new UnisourceV2Client({ baseUrl: 'http://x', serviceId: 's', getToken: () => null, silentBeta: true })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('importing subpath does NOT warn (warning only on construction)', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await import('../../src/v2/schemas')
    await import('../../src/v2/files')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
