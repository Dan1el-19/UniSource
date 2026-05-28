import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const okBulkBody = { processed: ['a', 'b'], failed: [] }

function mockOk(body: unknown = okBulkBody) {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'req-1' },
    json: () => Promise.resolve(body),
  })
}

describe('UnisourceV2Client.files.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('GETs /v2/files with no query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.list()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files',
      expect.objectContaining({ method: 'GET' })
    )
    expect(result.items).toEqual([])
  })

  it('forwards X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.files.list()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })
})

describe('UnisourceV2Client.files.bulk (canonical)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs to /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'trash', ids: ['a'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files/bulk',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends discriminated body for action: trash', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'trash', ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'trash', ids: ['x', 'y'] })
  })

  it('sends discriminated body for action: move with folder_id null', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'move', ids: ['a'], folder_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], folder_id: null })
    expect(body).toContain('"folder_id":null')
  })

  it('sends discriminated body for action: delete', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'delete', ids: ['a'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'delete', ids: ['a'] })
  })

  it('parses { processed, failed[] } response', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: ['a', 'b'],
      failed: [{ id: 'c', code: 'not_found', message: 'gone' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.bulk({ action: 'trash', ids: ['a', 'b', 'c'] })
    expect(result).toEqual({
      processed: ['a', 'b'],
      failed: [{ id: 'c', code: 'not_found', message: 'gone' }],
    })
  })

  it('rejects an unknown failure code at parse time', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: [],
      failed: [{ id: 'c', code: 'teapot', message: 'wat' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulk({ action: 'trash', ids: ['c'] })).rejects.toThrow()
  })

  it('throws UnisourceV2Error with V2 code on 400 validation_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request',
      headers: { get: () => 'req-400' },
      json: () => Promise.resolve({ error: { code: 'validation_error', message: 'ids must be 1..100' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulk({ action: 'trash', ids: ['a'] })).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      status: 400,
      code: 'validation_error',
      requestId: 'req-400',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.bulk({ action: 'trash', ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.files.bulkTrash (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: trash on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a', 'b'] })

    const call = vi.mocked(fetch).mock.calls[0]!
    expect(call[0]).toBe('https://api.example.com/v2/files/bulk')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'trash', ids: ['a', 'b'] })
  })

  it('forwards asUser via X-Target-User-ID', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a'] }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })
})

describe('UnisourceV2Client.files.bulkRestore (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: restore on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a'] })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'restore', ids: ['a'] })
  })
})

describe('UnisourceV2Client.files.bulkMove (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: move on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: 'f1' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'move', ids: ['a'], folder_id: 'f1' })
  })

  it('passes folder_id: null to root', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], folder_id: null })
  })

  it('TypeScript: folder_id is required (compile-time guarantee)', () => {
    // This is a type-only test: the line below would fail to compile if
    // folder_id were optional. Keep it as documentation.
    // @ts-expect-error folder_id is required
    const _ = (client: UnisourceV2Client) => client.files.bulkMove({ ids: ['a'] })
    expect(true).toBe(true)
  })
})
