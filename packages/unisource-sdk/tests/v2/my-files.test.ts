import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validFile = {
  id: 'file-1',
  service_id: 'svc-1',
  user_id: 'usr-1',
  folder_id: null,
  upload_id: 'up-1',
  filename: 'doc.txt',
  size: 100,
  mime_type: 'text/plain',
  storage_destination: 'r2' as const,
  is_trashed: false,
  trashed_at: null,
  created_at: 1700000000,
  updated_at: 1700000000,
}

// ─── list ───────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.myFiles.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { items: [validFile], next_cursor: null, limit: 25 }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /my-files', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.list()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('serializes folder_id, limit, cursor query params', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.list({ folder_id: 'fld-1', limit: 10, cursor: 'abc' })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('folder_id=fld-1')
    expect(url).toContain('limit=10')
    expect(url).toContain('cursor=abc')
  })

  it('omits undefined query params', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.list({ limit: 5 })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('limit=5')
    expect(url).not.toContain('folder_id')
    expect(url).not.toContain('cursor')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.list()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.list(undefined, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses flat { items, next_cursor, limit } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.myFiles.list()
    expect(result.items[0]!.id).toBe('file-1')
    expect(result.next_cursor).toBeNull()
    expect(result.limit).toBe(25)
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.myFiles.list(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on cursor_invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request',
      headers: { get: () => 'req-400' },
      json: () => Promise.resolve({ error: { code: 'cursor_invalid', message: 'cursor is invalid' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.myFiles.list({ cursor: 'bad' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 400, code: 'cursor_invalid', requestId: 'req-400',
    })
  })
})

// ─── listTrash ──────────────────────────────────────────────────────────────

describe('UnisourceV2Client.myFiles.listTrash', () => {
  afterEach(() => vi.unstubAllGlobals())

  const trashedFile = { ...validFile, is_trashed: true, trashed_at: 1700001000 }

  function mockOk(body: unknown = { items: [trashedFile], next_cursor: null, limit: 25 }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls GET /my-files/trash', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.listTrash()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/trash',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('serializes limit + cursor query params', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.listTrash({ limit: 50, cursor: 'xyz' })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('limit=50')
    expect(url).toContain('cursor=xyz')
  })

  it('omits undefined query params', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.listTrash({ limit: 5 })
    const url = vi.mocked(fetch).mock.calls[0]![0] as string
    expect(url).toContain('limit=5')
    expect(url).not.toContain('cursor')
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.listTrash()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.listTrash(undefined, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses flat { items, next_cursor, limit } response with trashed item', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.myFiles.listTrash()
    expect(result.items[0]!.is_trashed).toBe(true)
    expect(result.items[0]!.trashed_at).toBe(1700001000)
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.myFiles.listTrash(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on cursor_invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request',
      headers: { get: () => 'req-400' },
      json: () => Promise.resolve({ error: { code: 'cursor_invalid', message: 'cursor is invalid' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.myFiles.listTrash({ cursor: 'bad' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 400, code: 'cursor_invalid', requestId: 'req-400',
    })
  })
})

// ─── move ───────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.myFiles.move', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { success: true, id: 'file-1', folder_id: 'fld-2' }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls PATCH /my-files/:id/move', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('file-1', { folder_id: 'fld-2' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/file-1/move',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('id:with space', { folder_id: null })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/my-files/id%3Awith%20space/move',
      expect.anything()
    )
  })

  it('sends folder_id in body (string target)', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('file-1', { folder_id: 'fld-2' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ folder_id: 'fld-2' })
  })

  it('sends folder_id: null in body (move to root)', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, id: 'file-1', folder_id: null }))
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('file-1', { folder_id: null })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ folder_id: null })
  })

  it('sets Content-Type, X-Service-ID, Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('file-1', { folder_id: 'fld-2' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('forwards X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.myFiles.move('file-1', { folder_id: 'fld-2' }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('parses { success, id, folder_id } response', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.myFiles.move('file-1', { folder_id: 'fld-2' })
    expect(result).toEqual({ success: true, id: 'file-1', folder_id: 'fld-2' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.myFiles.move('file-1', { folder_id: 'fld-2' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })

  it('throws UnisourceV2Error on target folder not_found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'not_found', message: 'Target folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.myFiles.move('file-1', { folder_id: 'missing' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('throws UnisourceV2Error on conflict (file in trash)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 409, statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({ error: { code: 'conflict', message: 'Cannot move file into a trashed folder' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.myFiles.move('file-1', { folder_id: 'trashed-fld' })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 409, code: 'conflict', requestId: 'req-409',
    })
  })
})
