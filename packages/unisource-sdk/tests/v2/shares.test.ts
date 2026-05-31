import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validLink = {
  id: 'sl1', service_id: 's1', file_id: 'f1', user_id: 'u1',
  slug: 'abc123', name: null, has_password: false,
  expires_at: null, download_count: 0, max_downloads: null,
  is_active: true, created_at: 1000000, updated_at: 1000000,
}

describe('UnisourceV2Client.shares.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { items: [validLink] }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /v2/shares', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.list()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.list()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.list(undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shares.list()
    expect(result.items[0]!.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 401, statusText: 'Unauthorized',
      headers: { get: () => 'req-401' },
      json: () => Promise.resolve({ error: { code: 'unauthorized', message: 'Unauthorized' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shares.list()).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 401, code: 'unauthorized', requestId: 'req-401',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shares.list(controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shares.create', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { link: validLink }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls POST /v2/shares', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends body with file_id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body.file_id).toBe('f1')
  })

  it('sends full body with all optional fields', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1', name: 'My Link', expires_at: 9999, max_downloads: 5, password: 'secret' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ file_id: 'f1', name: 'My Link', expires_at: 9999, max_downloads: 5, password: 'secret' })
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.create({ file_id: 'f1' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shares.create({ file_id: 'f1' })
    expect(result.link.id).toBe('sl1')
  })

  it('handles 201 status (ok=true)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 201, json: () => Promise.resolve({ link: validLink }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shares.create({ file_id: 'f1' })
    expect(result.link.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      headers: { get: () => 'req-422' },
      json: () => Promise.resolve({ error: { code: 'validation_error', message: 'file_id required' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shares.create({ file_id: 'f1' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 422, code: 'validation_error', requestId: 'req-422',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shares.create({ file_id: 'f1' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shares.get', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { link: validLink }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /v2/shares/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.get('sl1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares/sl1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.get('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.get('sl1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.get('sl1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shares.get('sl1')
    expect(result.link.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'share_not_found', message: 'Not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shares.get('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'unknown', rawCode: 'share_not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shares.get('sl1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shares.delete', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true as const, id: 'sl1' }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls DELETE /v2/shares/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.delete('sl1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares/sl1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.delete('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/shares/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.delete('sl1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shares.delete('sl1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shares.delete('sl1')
    expect(result).toEqual({ success: true, id: 'sl1' })
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'share_not_found', message: 'Not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shares.delete('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'unknown', rawCode: 'share_not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shares.delete('sl1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
