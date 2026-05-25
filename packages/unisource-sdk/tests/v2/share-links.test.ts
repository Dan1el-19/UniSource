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

describe('UnisourceV2Client.shareLinks.create', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { link: validLink }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls POST /my-files/:fileId/share-links', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('f1', {})
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/f1/share-links',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('URL-encodes fileId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('file:with space', {})
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/file%3Awith%20space/share-links',
      expect.anything()
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('f1', {})
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('f1', {})
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('f1', {}, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('sends body fields', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.create('f1', { name: 'My Link', expires_at: 9999, max_downloads: 5, password: 'secret', slug: 'my-slug' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'My Link', expires_at: 9999, max_downloads: 5, password: 'secret', slug: 'my-slug' })
  })

  it('handles 201 status (ok=true)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 201, json: () => Promise.resolve({ link: validLink }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shareLinks.create('f1', {})
    expect(result.link.id).toBe('sl1')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shareLinks.create('f1', {})
    expect(result.link.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({ error: { code: 'conflict', message: 'Slug already in use' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shareLinks.create('f1', { slug: 'taken' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 409, code: 'conflict', requestId: 'req-409',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shareLinks.create('f1', {}, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shareLinks.listForFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { items: [validLink] }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /my-files/:fileId/share-links', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.listForFile('f1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/f1/share-links',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes fileId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.listForFile('file:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/file%3Awith%20space/share-links',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.listForFile('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.listForFile('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shareLinks.listForFile('f1')
    expect(result.items[0]!.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'File not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shareLinks.listForFile('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shareLinks.listForFile('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shareLinks.update', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { link: validLink }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls PATCH /share-links/:linkId', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'New Name' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/share-links/sl1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes linkId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('id:with space', { name: 'x' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/share-links/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'x' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'x' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'x' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('sends partial update with only name', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'New Name' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'New Name' })
  })

  it('sends partial update with only is_active', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { is_active: false })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ is_active: false })
  })

  it('sends full update body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.update('sl1', { name: 'x', is_active: true, expires_at: 9999, max_downloads: 10, password: 'pw' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'x', is_active: true, expires_at: 9999, max_downloads: 10, password: 'pw' })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shareLinks.update('sl1', { name: 'x' })
    expect(result.link.id).toBe('sl1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Share link not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shareLinks.update('missing', { name: 'x' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shareLinks.update('sl1', { name: 'x' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.shareLinks.delete', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true as const, id: 'sl1' }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls DELETE /share-links/:linkId', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.delete('sl1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/share-links/sl1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('URL-encodes linkId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.delete('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/share-links/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.delete('sl1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.shareLinks.delete('sl1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.shareLinks.delete('sl1')
    expect(result).toEqual({ success: true, id: 'sl1' })
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Share link not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.shareLinks.delete('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.shareLinks.delete('sl1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
