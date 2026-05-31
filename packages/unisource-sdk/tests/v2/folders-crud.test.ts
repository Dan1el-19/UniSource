import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validFolder = {
  id: 'fld-1',
  service_id: 'svc-1',
  user_id: 'usr-1',
  parent_id: null,
  name: 'Documents',
  color_tag: null,
  is_trashed: false,
  trashed_at: null,
  created_at: 1700000000,
  updated_at: 1700000000,
}

// ─── create ─────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.folders.create', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { folder: validFolder }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls POST /v2/folders', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.create({ name: 'Documents' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends name + parent_id + color_tag in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.create({ name: 'Sub', parent_id: 'fld-root', color_tag: 'blue' })
    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Sub',
      parent_id: 'fld-root',
      color_tag: 'blue',
    })
  })

  it('sets Content-Type, X-Service-ID, Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.create({ name: 'X' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.create({ name: 'X' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses { folder } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.create({ name: 'X' })
    expect(result.folder.id).toBe('fld-1')
    expect(result.folder.name).toBe('Documents')
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.create({ name: 'X' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on parent_id not_found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Parent folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.create({ name: 'X', parent_id: 'missing' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })
})

// ─── get ────────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.folders.get', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { folder: validFolder }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /v2/folders/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.get('fld-1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/fld-1',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.get('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.get('fld-1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.get('fld-1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses { folder } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.get('fld-1')
    expect(result.folder.id).toBe('fld-1')
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.get('fld-1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.get('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })
})

// ─── update ─────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.folders.update', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { folder: { ...validFolder, name: 'Renamed' } }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls PATCH /v2/folders/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.update('fld-1', { name: 'Renamed' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/fld-1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.update('id:with space', { name: 'X' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/id%3Awith%20space',
      expect.anything()
    )
  })

  it('sends body fields (name, color_tag)', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.update('fld-1', { name: 'Renamed', color_tag: 'red' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'Renamed', color_tag: 'red' })
  })

  it('sets Content-Type, X-Service-ID, Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.update('fld-1', { name: 'X' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.update('fld-1', { name: 'X' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses { folder } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.update('fld-1', { name: 'Renamed' })
    expect(result.folder.name).toBe('Renamed')
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.update('fld-1', { name: 'X' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.update('missing', { name: 'X' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })
})

// ─── delete ─────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.folders.delete', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { success: true, id: 'fld-1', permanent: false }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls DELETE /v2/folders/:id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('fld-1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/fld-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/id%3Awith%20space',
      expect.anything()
    )
  })

  it('appends ?permanent=true when permanent option is true', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, id: 'fld-1', permanent: true, folders_deleted: 3 }))
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('fld-1', undefined, { permanent: true })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('?permanent=true')
  })

  it('omits query string when permanent is not set or false', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('fld-1', undefined, { permanent: false })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).not.toContain('permanent')
  })

  it('parses soft-delete response { success, id, permanent: false }', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.delete('fld-1')
    expect(result).toEqual({ success: true, id: 'fld-1', permanent: false })
  })

  it('parses permanent-delete response with folders_deleted', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, id: 'fld-1', permanent: true, folders_deleted: 5 }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.delete('fld-1', undefined, { permanent: true })
    expect(result).toEqual({ success: true, id: 'fld-1', permanent: true, folders_deleted: 5 })
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('fld-1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.delete('fld-1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.delete('fld-1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.delete('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })
})

// ─── restore ────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.folders.restore', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { success: true, id: 'fld-1' }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls POST /v2/folders/:id/restore', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.restore('fld-1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/fld-1/restore',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.restore('id:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/id%3Awith%20space/restore',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.restore('fld-1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.restore('fld-1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses { success, id } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.restore('fld-1')
    expect(result).toEqual({ success: true, id: 'fld-1' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.restore('fld-1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on 404 (not in trash)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Folder not found or not in trash' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.restore('fld-1')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })
})
