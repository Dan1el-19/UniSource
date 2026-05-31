import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { UnisourceV2Client } from '../../src/v2/client'
import { createV2Request } from '../../src/v2/transport'

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const dummyParser = z.object({ ok: z.boolean() })

describe('UnisourceV2Client constructor — credential mutual exclusion', () => {
  it('throws when both apiKey and getToken are provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      getToken: () => 'jwt',
      silentBeta: true,
    })).toThrow('UnisourceV2Client: provide either apiKey or getToken, not both')
  })

  it('does NOT throw when only apiKey is provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      silentBeta: true,
    })).not.toThrow()
  })

  it('does NOT throw when only getToken is provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt',
      silentBeta: true,
    })).not.toThrow()
  })

  it('does NOT throw when neither is provided (anonymous mode)', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })).not.toThrow()
  })
})

describe('createV2Request — Authorization header', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('sends Bearer ${apiKey} when apiKey is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_static',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer key_static')
    expect(headers['X-Service-ID']).toBe('svc')
  })

  it('sends Bearer ${getToken()} when getToken is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer jwt_token')
  })

  it('does NOT send Authorization when neither apiKey nor getToken is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT send Authorization when auth: "none" is set per-request, even with apiKey configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_static',
      silentBeta: true,
    })
    await request('GET', '/public/abc', { parser: dummyParser, auth: 'none' })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT send Authorization when auth: "none" is set per-request, even with getToken configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await request('GET', '/public/abc', { parser: dummyParser, auth: 'none' })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })
})
