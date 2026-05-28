import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

describe('UnisourceV2Client.files.bulkTrash', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true, processed_count: 2 }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls correct URL with POST', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a', 'b'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files/bulk-trash',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends ids in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ ids: ['x', 'y'] })
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a'] }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses success response', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, processed_count: 3 }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.bulkTrash({ ids: ['a', 'b', 'c'] })
    expect(result).toEqual({ success: true, processed_count: 3 })
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      headers: { get: () => 'req-422' },
      json: () => Promise.resolve({ error: { code: 'ids_required', message: 'ids required' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulkTrash({ ids: ['a'] })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 422, code: 'unknown', rawCode: 'ids_required', message: 'ids required', requestId: 'req-422',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.bulkTrash({ ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.files.bulkRestore', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true, processed_count: 2 }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls correct URL with POST', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a', 'b'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files/bulk-restore',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends ids in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ ids: ['x', 'y'] })
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a'] }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses success response', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, processed_count: 3 }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.bulkRestore({ ids: ['a', 'b', 'c'] })
    expect(result).toEqual({ success: true, processed_count: 3 })
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, statusText: 'Unprocessable Entity',
      headers: { get: () => 'req-422' },
      json: () => Promise.resolve({ error: { code: 'ids_required', message: 'ids required' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulkRestore({ ids: ['a'] })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 422, code: 'unknown', rawCode: 'ids_required', message: 'ids required', requestId: 'req-422',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.bulkRestore({ ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.files.bulkMove', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { success: true, processed_count: 2 }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls correct URL with POST', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a', 'b'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files/bulk-move',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends ids in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ ids: ['x', 'y'] })
  })

  it('includes folder_id string in body', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: 'f1' })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ ids: ['a'], folder_id: 'f1' })
  })

  it('includes folder_id null in body as JSON null', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(body).toContain('"folder_id":null')
    expect(JSON.parse(body).folder_id).toBeNull()
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'] })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'] }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses success response', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, processed_count: 2 }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.bulkMove({ ids: ['a', 'b'], folder_id: 'f1' })
    expect(result).toEqual({ success: true, processed_count: 2 })
  })

  it('throws UnisourceV2Error on 409 target folder trashed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({ error: { code: 'folder_trashed', message: 'Target folder is trashed' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulkMove({ ids: ['a'], folder_id: 'trashed-folder' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 409, code: 'unknown', rawCode: 'folder_trashed', message: 'Target folder is trashed', requestId: 'req-409',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.bulkMove({ ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
