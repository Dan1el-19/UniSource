import { afterEach, describe, expect, it, vi } from 'vitest'
import { createV2Request } from '../../src/v2/transport'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
}

const parser = {
  parse: (value: unknown) => value as { ok: true },
}

describe('createV2Request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sets service and auth headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }))

    const request = createV2Request(mockConfig)
    await request('GET', '/v2/files', { parser })

    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('sets X-Target-User-ID when asUser is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }))

    const request = createV2Request(mockConfig)
    await request('GET', '/v2/files', { asUser: 'user-123', parser })

    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-123')
  })

  it('serializes JSON body and content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }))

    const request = createV2Request(mockConfig)
    await request('POST', '/v2/files/bulk-move', {
      body: { ids: ['a'], folder_id: null },
      parser,
    })

    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a'], folder_id: null })
  })

  it('serializes query params and skips undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }))

    const request = createV2Request(mockConfig)
    await request('GET', '/v2/files', {
      query: { limit: 10, cursor: undefined, parent_id: null },
      parser,
    })

    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.has('cursor')).toBe(false)
    expect(url.searchParams.get('parent_id')).toBe('null')
  })

  it('throws UnisourceV2Error with parsed error details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: { get: () => 'req-409' },
      json: () => Promise.resolve({
        error: {
          code: 'cycle_detected',
          message: 'Cannot move folder into itself',
          details: { folder_id: 'f1' },
        },
      }),
    }))

    const request = createV2Request(mockConfig)

    await expect(request('POST', '/v2/folders/bulk-move', { parser })).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      status: 409,
      code: 'cycle_detected',
      requestId: 'req-409',
      details: { folder_id: 'f1' },
    })
  })

  it('falls back to status text when error body is malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    }))

    const request = createV2Request(mockConfig)

    await expect(request('GET', '/v2/files', { parser })).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      message: 'Bad Gateway',
      status: 502,
      code: 'unknown',
      requestId: 'unknown',
    })
  })

  it('passes AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }))

    const request = createV2Request(mockConfig)
    const controller = new AbortController()
    await request('GET', '/v2/files', { signal: controller.signal, parser })

    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
