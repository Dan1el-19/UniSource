import { describe, it, expect, vi, afterEach } from 'vitest'
import { v2FolderSchema, v2FolderListResponseSchema } from '../../src/v2/folders'
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
