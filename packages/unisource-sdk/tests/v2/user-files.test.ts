import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validFile = {
  id: 'f1', service_id: 's1', user_id: 'u1', folder_id: null, upload_id: 'up1',
  filename: 'test.txt', size: 100, mime_type: 'text/plain',
  storage_destination: 'r2' as const, is_trashed: false,
  trashed_at: null, created_at: 1000000, updated_at: 1000000,
}

describe('UnisourceV2Client.userFiles.get', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { file: validFile }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /files/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.get('f1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/f1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.get('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.get('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.get('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.userFiles.get('f1')
    expect(result.file.id).toBe('f1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'File not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.get('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.userFiles.get('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.userFiles.update', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { file: validFile }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls PATCH /files/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('f1', { filename: 'new.txt' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/f1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('id:with space', { filename: 'x.txt' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('f1', { filename: 'new.txt' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('f1', { filename: 'new.txt' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('f1', { filename: 'new.txt' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('sends filename in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.update('f1', { filename: 'renamed.txt' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ filename: 'renamed.txt' })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.userFiles.update('f1', { filename: 'new.txt' })
    expect(result.file.id).toBe('f1')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'File not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.update('missing', { filename: 'x.txt' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.userFiles.update('f1', { filename: 'new.txt' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.userFiles.delete', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true as const, id: 'f1', permanent: false }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls DELETE /files/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/f1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/id%3Awith%20space',
      expect.anything()
    )
  })

  it('appends ?permanent=true when permanent option is true', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, id: 'f1', permanent: true }))
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1', undefined, { permanent: true })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('?permanent=true')
  })

  it('omits query string when permanent is not set', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1')
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).not.toContain('permanent')
  })

  it('omits query string when permanent is false', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1', undefined, { permanent: false })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).not.toContain('permanent')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.delete('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.userFiles.delete('f1')
    expect(result).toEqual({ success: true, id: 'f1', permanent: false })
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'File not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.delete('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.userFiles.delete('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.userFiles.restore', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true as const, id: 'f1' }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls POST /files/:id/restore', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.restore('f1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/f1/restore',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.restore('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/id%3Awith%20space/restore',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.restore('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.restore('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.userFiles.restore('f1')
    expect(result).toEqual({ success: true, id: 'f1' })
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({ error: { code: 'not_trashed', message: 'File is not trashed' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.restore('f1')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 409, code: 'unknown', rawCode: 'not_trashed', requestId: 'req-409',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.userFiles.restore('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.userFiles.downloadUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  const validDownloadUrl = {
    upload_id: 'up1',
    destination: 'r2' as const,
    download_url: 'https://cdn.example.com/file.txt',
    expires_at: 9999999999,
  }

  function mockOk(body = validDownloadUrl) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /files/:id/download-url', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.downloadUrl('f1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/f1/download-url',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.downloadUrl('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/files/id%3Awith%20space/download-url',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.downloadUrl('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.userFiles.downloadUrl('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.userFiles.downloadUrl('f1')
    expect(result.upload_id).toBe('up1')
    expect(result.download_url).toBe('https://cdn.example.com/file.txt')
  })

  it('throws UnisourceV2Error on 409 (trashed file)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({ error: { code: 'file_trashed', message: 'File is trashed' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.downloadUrl('f1')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 409, code: 'unknown', rawCode: 'file_trashed', requestId: 'req-409',
    })
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'File not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.userFiles.downloadUrl('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.userFiles.downloadUrl('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
