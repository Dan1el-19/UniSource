import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validRelease = {
  id: 'rel1', name: 'v1.0.0', size: 1024, r2_key: 'releases/v1.0.0',
  tags: ['stable'], notes: null, force_update: false,
  created_at: '2024-01-01T00:00:00Z',
  download_url: 'https://cdn.example.com/v1.0.0',
  download_url_expires_at: 9999999999,
}

describe('UnisourceV2Client.app.latestRelease', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = validRelease) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /app/releases/latest without channel', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.app.latestRelease()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/app/releases/latest',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('appends channel query param when provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.app.latestRelease({ channel: 'beta' })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('channel')).toBe('beta')
  })

  it('does not append channel param when not provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.app.latestRelease()
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.has('channel')).toBe(false)
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.app.latestRelease()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.app.latestRelease(undefined, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.app.latestRelease()
    expect(result.id).toBe('rel1')
    expect(result.name).toBe('v1.0.0')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'release_not_found', message: 'No release found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.app.latestRelease()).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'unknown', rawCode: 'release_not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.app.latestRelease(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
