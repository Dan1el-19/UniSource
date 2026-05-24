import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'
import { UnisourceV2Error } from '../../src/v2/errors'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

describe('UnisourceV2Client.files.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls correct URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.files.list()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('serializes query params', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], page: { limit: 10, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.files.list({ limit: 10, trash: 'trashed', sort_by: 'name' })
    const url = new URL((vi.mocked(fetch).mock.calls[0]![0] as string))
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('trash')).toBe('trashed')
    expect(url.searchParams.get('sort_by')).toBe('name')
  })

  it('sets auth headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.files.list()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token')
    expect(headers['X-Service-ID']).toBe('svc-1')
  })

  it('sets X-Target-User-ID when asUser provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.files.list(undefined, undefined, { asUser: 'user-123' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-123')
  })

  it('throws UnisourceV2Error on error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => 'req-123' },
      json: () => Promise.resolve({ error: { code: 'cursor_invalid', message: 'bad cursor', request_id: 'req-123' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.list({ cursor: 'bad' })).rejects.toThrow(UnisourceV2Error)
  })

  it('falls back to status text when error response body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: { get: () => 'req-502' },
      json: () => Promise.resolve(null),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.list()).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      message: 'Bad Gateway',
      status: 502,
      code: 'unknown',
      requestId: 'req-502',
    })
  })

  it('AbortSignal is passed to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], page: { limit: 25, next_cursor: null } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.list(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
