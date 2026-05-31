import { describe, it, expect, vi, afterEach } from 'vitest'
import { v2FolderSchema, v2FolderListResponseSchema, v2FolderBreadcrumbsResponseSchema } from '../../src/v2/folders'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validFolder = {
  id: 'f1', service_id: 's1', user_id: 'u1', parent_id: null,
  name: 'a', color_tag: null, is_trashed: false, trashed_at: null,
  created_at: 100, updated_at: 100,
}

describe('v2FolderSchema', () => {
  it('parses valid folder', () => {
    expect(v2FolderSchema.parse(validFolder).id).toBe('f1')
  })

  it('rejects is_trashed as 0|1 (must be boolean)', () => {
    expect(() => v2FolderSchema.parse({ ...validFolder, is_trashed: 0 as any })).toThrow()
  })
})

describe('v2FolderListResponseSchema', () => {
  it('parses full response shape', () => {
    const ok = v2FolderListResponseSchema.parse({ items: [], page: { limit: 25, next_cursor: null } })
    expect(ok.page.limit).toBe(25)
  })

  it('rejects missing page', () => {
    expect(() => v2FolderListResponseSchema.parse({ items: [] })).toThrow()
  })
})

describe('v2FolderBreadcrumbsResponseSchema', () => {
  it('parses valid response', () => {
    const ok = v2FolderBreadcrumbsResponseSchema.parse({ breadcrumbs: [validFolder] })
    expect(ok.breadcrumbs[0]!.id).toBe('f1')
  })

  it('rejects is_trashed as numeric (V1 shape)', () => {
    expect(() => v2FolderBreadcrumbsResponseSchema.parse({ breadcrumbs: [{ ...validFolder, is_trashed: 0 }] })).toThrow()
  })
})

describe('UnisourceV2Client.folders.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { items: [], page: { limit: 25, next_cursor: null } }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls correct URL', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.list()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('serializes query params', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.list({ parent_id: 'p1', sort_by: 'name', limit: 10 })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('parent_id')).toBe('p1')
    expect(url.searchParams.get('sort_by')).toBe('name')
    expect(url.searchParams.get('limit')).toBe('10')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.list(undefined, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request',
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ error: { code: 'cursor_invalid', message: 'bad', request_id: 'req-1' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.list()).rejects.toThrow(UnisourceV2Error)
  })

  it('falls back to status text when error body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 502, statusText: 'Bad Gateway',
      headers: { get: () => 'req-502' },
      json: () => Promise.resolve(null),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.list()).rejects.toMatchObject({
      name: 'UnisourceV2Error', message: 'Bad Gateway', status: 502, code: 'unknown', requestId: 'req-502',
    })
  })
})

describe('UnisourceV2Client.folders.breadcrumbs', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body = { breadcrumbs: [validFolder] }) {
    return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
  }

  it('calls correct URL with id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.breadcrumbs('folder-1')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/folder-1/breadcrumbs',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('URL-encodes id with special characters', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.breadcrumbs('folder:with space')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/folder%3Awith%20space/breadcrumbs',
      expect.anything()
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.breadcrumbs('f1')
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.breadcrumbs('f1', undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })

  it('validates response with v2FolderSchema (boolean is_trashed)', async () => {
    vi.stubGlobal('fetch', mockOk({ breadcrumbs: [{ ...validFolder, is_trashed: true }] }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.breadcrumbs('f1')
    expect(result.breadcrumbs[0]!.is_trashed).toBe(true)
  })

  it('throws UnisourceV2Error on 404 with parsed code/message/requestId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      headers: { get: () => 'req-404' },
      json: () => Promise.resolve({ error: { code: 'folder_not_found', message: 'Folder not found' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.folders.breadcrumbs('missing')).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'unknown', rawCode: 'folder_not_found', message: 'Folder not found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.breadcrumbs('f1', controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ---------------------------------------------------------------------------
// New canonical bulk method + delegating wrappers (Task 13)
// ---------------------------------------------------------------------------
describe('UnisourceV2Client.folders.bulk (canonical)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { processed: ['a'], failed: [] }) {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve(body),
    })
  }

  it('POSTs to /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'trash', ids: ['a'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/bulk',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends discriminated body for action: trash', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'trash', ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'trash', ids: ['x', 'y'] })
  })

  it('sends discriminated body for action: move with parent_id null', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'move', ids: ['a'], parent_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], parent_id: null })
    expect(body).toContain('"parent_id":null')
  })

  it('parses { processed, failed[] } response', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: ['a'],
      failed: [{ id: 'b', code: 'conflict', message: 'Cycle detected' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.bulk({ action: 'move', ids: ['a', 'b'], parent_id: 'p1' })
    expect(result.failed[0]).toEqual({ id: 'b', code: 'conflict', message: 'Cycle detected' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.bulk({ action: 'trash', ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.folders.bulkTrash (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    })
  }

  it('delegates to bulk with action: trash on /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkTrash({ ids: ['a', 'b'] })

    const call = vi.mocked(fetch).mock.calls[0]!
    expect(call[0]).toBe('https://api.example.com/v2/folders/bulk')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'trash', ids: ['a', 'b'] })
  })
})

describe('UnisourceV2Client.folders.bulkRestore (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: restore on /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkRestore({ ids: ['a'] })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'restore', ids: ['a'] })
  })
})

describe('UnisourceV2Client.folders.bulkMove (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    })
  }

  it('delegates to bulk with action: move and parent_id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkMove({ ids: ['a'], parent_id: 'p1' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'move', ids: ['a'], parent_id: 'p1' })
  })

  it('passes parent_id: null to root', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkMove({ ids: ['a'], parent_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], parent_id: null })
  })

  it('TypeScript: parent_id is required', () => {
    // @ts-expect-error parent_id is required
    const _ = (client: UnisourceV2Client) => client.folders.bulkMove({ ids: ['a'] })
    expect(true).toBe(true)
  })
})
