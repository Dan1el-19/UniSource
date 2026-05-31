import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { createV2Request } from '../../src/v2/transport'
import { UnisourceV2Error } from '../../src/v2/errors'

const dummyParser = z.object({ ok: z.boolean() })

function errorResponse(status: number, body: unknown, requestId = 'req_test_1'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  })
}

describe('createV2Request — error parsing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves a known V2ErrorCode in error.code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(404, {
      error: { code: 'not_found', message: 'File not found' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    await expect(request('GET', '/v2/files/123', { parser: dummyParser }))
      .rejects.toMatchObject({
        name: 'UnisourceV2Error',
        status: 404,
        code: 'not_found',
        message: 'File not found',
        requestId: 'req_test_1',
        rawCode: undefined,
      })
  })

  it('maps unknown backend code to "unknown" and preserves rawCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(418, {
      error: { code: 'teapot_error', message: 'I am a teapot' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    let caught: UnisourceV2Error | undefined
    try {
      await request('GET', '/v2/files', { parser: dummyParser })
    } catch (e) {
      caught = e as UnisourceV2Error
    }

    expect(caught).toBeInstanceOf(UnisourceV2Error)
    expect(caught?.code).toBe('unknown')
    expect(caught?.rawCode).toBe('teapot_error')
    expect(caught?.message).toBe('I am a teapot')
  })

  it('maps missing code to "unknown" with no rawCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(500, {
      error: { message: 'Server boom' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    let caught: UnisourceV2Error | undefined
    try {
      await request('GET', '/v2/files', { parser: dummyParser })
    } catch (e) {
      caught = e as UnisourceV2Error
    }

    expect(caught?.code).toBe('unknown')
    expect(caught?.rawCode).toBeUndefined()
  })

  it('uses requestId from X-Request-Id header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(401, {
      error: { code: 'unauthorized', message: 'No token' },
    }, 'req_xyz_42')))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })

    await expect(request('GET', '/v2/files', { parser: dummyParser }))
      .rejects.toMatchObject({ requestId: 'req_xyz_42' })
  })
})
