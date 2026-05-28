import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import {
  publicShareLinkResponseSchema,
  publicUnlockResponseSchema,
} from '../../src/v2/public-schemas'

const validUnlockedResponse = {
  file_id: 'f1',
  filename: 'doc.pdf',
  size: 1024,
  mime_type: 'application/pdf',
  requires_password: false,
  download_url: 'https://api.example.com/public/abc/download?token=xyz',
  url_expires_at: 9999999999,
  link_name: 'My Share',
  link_expires_at: null,
}

const validLockedResponse = {
  filename: 'secret.pdf',
  size: 2048,
  mime_type: 'application/pdf',
  requires_password: true,
  link_name: null,
}

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

describe('UnisourceV2Client.public.getShareLink', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls GET /public/:slug', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await client.public.getShareLink('abc')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/public/abc',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes slug with special characters', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await client.public.getShareLink('my slug/with?special=chars')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/public/my%20slug%2Fwith%3Fspecial%3Dchars',
      expect.anything()
    )
  })

  it('does NOT send Authorization even when getToken is configured', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await client.public.getShareLink('test-slug')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['X-Service-ID']).toBe('svc')
  })

  it('does NOT send Authorization even when apiKey is configured', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      silentBeta: true,
    })
    await client.public.getShareLink('test-slug')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['X-Service-ID']).toBe('svc')
  })

  it('parses unlocked (requires_password: false) response', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    const result = await client.public.getShareLink('abc')
    expect(result.requires_password).toBe(false)
    if (result.requires_password === false) {
      expect(result.file_id).toBe('f1')
      expect(result.download_url).toContain('/public/abc/download')
      expect(result.url_expires_at).toBe(9999999999)
    }
  })

  it('parses locked (requires_password: true) response', async () => {
    vi.stubGlobal('fetch', mockOk(validLockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    const result = await client.public.getShareLink('abc')
    expect(result.requires_password).toBe(true)
    if (result.requires_password === true) {
      expect(result.filename).toBe('secret.pdf')
      // download_url must NOT exist on the locked variant
      expect((result as Record<string, unknown>).download_url).toBeUndefined()
    }
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    const controller = new AbortController()
    await client.public.getShareLink('abc', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => 'req-pub-1' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Share link not found or inactive' } }),
    }))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await expect(client.public.getShareLink('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      status: 404,
      code: 'not_found',
      requestId: 'req-pub-1',
    })
  })
})

describe('UnisourceV2Client.public.unlockShareLink', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls POST /public/:slug/unlock with password body', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await client.public.unlockShareLink('abc', { password: 'p@ss' })
    const call = vi.mocked(fetch).mock.calls[0]!
    expect(call[0]).toBe('https://api.example.com/public/abc/unlock')
    expect((call[1] as RequestInit).method).toBe('POST')
    expect((call[1] as RequestInit).body).toBe(JSON.stringify({ password: 'p@ss' }))
  })

  it('URL-encodes slug', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await client.public.unlockShareLink('my slug/x', { password: 'pw' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/public/my%20slug%2Fx/unlock',
      expect.anything()
    )
  })

  it('does NOT send Authorization even when getToken is configured', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await client.public.unlockShareLink('abc', { password: 'pw' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT send Authorization even when apiKey is configured', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      silentBeta: true,
    })
    await client.public.unlockShareLink('abc', { password: 'pw' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await client.public.unlockShareLink('abc', { password: 'pw' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('parses unlocked response (always requires_password: false)', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    const result = await client.public.unlockShareLink('abc', { password: 'pw' })
    expect(result.requires_password).toBe(false)
    expect(result.file_id).toBe('f1')
    expect(result.download_url).toContain('token=xyz')
  })

  it('throws UnisourceV2Error on 401 (incorrect password)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => 'req-pub-2' },
      json: () => Promise.resolve({ error: { code: 'unauthorized', message: 'Incorrect password' } }),
    }))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await expect(
      client.public.unlockShareLink('abc', { password: 'wrong' })
    ).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      status: 401,
      code: 'unauthorized',
      requestId: 'req-pub-2',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(validUnlockedResponse))
    const client = new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    const controller = new AbortController()
    await client.public.unlockShareLink('abc', { password: 'pw' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('public-schemas: discriminated union round-trips', () => {
  it('publicShareLinkResponseSchema accepts the unlocked variant', () => {
    const parsed = publicShareLinkResponseSchema.parse(validUnlockedResponse)
    expect(parsed.requires_password).toBe(false)
  })

  it('publicShareLinkResponseSchema accepts the locked variant', () => {
    const parsed = publicShareLinkResponseSchema.parse(validLockedResponse)
    expect(parsed.requires_password).toBe(true)
  })

  it('publicUnlockResponseSchema rejects locked-shape (must always be unlocked)', () => {
    expect(() => publicUnlockResponseSchema.parse(validLockedResponse)).toThrow()
  })
})
