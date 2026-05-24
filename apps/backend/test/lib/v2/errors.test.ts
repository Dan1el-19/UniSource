import { describe, it, expect } from 'vitest'
import { V2Error, errorResponse, type V2ErrorBody } from '../../../src/lib/v2/errors'
import type { Context } from 'hono'
import { ZodError } from 'zod'
import { HTTPException } from 'hono/http-exception'
import { v2ErrorHandler } from '../../../src/middleware/v2Errors'

const mockCtx = (requestId = 'test-id-123'): Context => {
  let lastResponse: Response | null = null
  return {
    var: { requestId },
    json: (body: unknown, status?: number) => {
      lastResponse = new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
      return lastResponse
    },
    res: {
      get status() {
        return lastResponse?.status ?? 200
      },
    },
  } as unknown as Context
}

describe('V2Error', () => {
  it('has code, status, message, details properties', () => {
    const err = new V2Error('validation_error', 400, 'Invalid input', { field: 'name' })
    expect(err.code).toBe('validation_error')
    expect(err.status).toBe(400)
    expect(err.message).toBe('Invalid input')
    expect(err.details).toEqual({ field: 'name' })
  })

  it('extends Error', () => {
    const err = new V2Error('internal_error', 500)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('V2Error')
  })

  it('uses code as message when message is omitted', () => {
    const err = new V2Error('cursor_invalid', 400)
    expect(err.message).toBe('cursor_invalid')
  })
})

describe('errorResponse', () => {
  it('returns JSON response with correct status', async () => {
    const ctx = mockCtx()
    const err = new V2Error('validation_error', 400, 'Invalid input')
    const response = errorResponse(ctx, err)

    expect(response.status).toBe(400)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('validation_error')
  })

  it('includes error code, message, and request_id', async () => {
    const ctx = mockCtx('req-123')
    const err = new V2Error('cursor_invalid', 400, 'Cursor is invalid')
    const response = errorResponse(ctx, err)

    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('cursor_invalid')
    expect(body.error.message).toBe('Cursor is invalid')
    expect(body.error.request_id).toBe('req-123')
  })

  it('includes details when provided', async () => {
    const ctx = mockCtx()
    const details = { field: 'name', reason: 'too short' }
    const err = new V2Error('validation_error', 400, 'Invalid', details)
    const response = errorResponse(ctx, err)

    const body = (await response.json()) as V2ErrorBody
    expect(body.error.details).toEqual(details)
  })

  it('omits details when not provided', async () => {
    const ctx = mockCtx()
    const err = new V2Error('internal_error', 500)
    const response = errorResponse(ctx, err)

    const body = (await response.json()) as V2ErrorBody
    expect(body.error.details).toBeUndefined()
  })
})

describe('v2ErrorHandler', () => {
  it('handles V2Error directly', async () => {
    const ctx = mockCtx('req-456')
    const err = new V2Error('forbidden', 403, 'Access denied')
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(403)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('forbidden')
    expect(body.error.request_id).toBe('req-456')
  })

  it('maps HTTPException 401 to unauthorized', async () => {
    const ctx = mockCtx()
    const err = new HTTPException(401, { message: 'Not authenticated' })
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(401)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('unauthorized')
  })

  it('maps HTTPException 403 to forbidden', async () => {
    const ctx = mockCtx()
    const err = new HTTPException(403, { message: 'Forbidden' })
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(403)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('forbidden')
  })

  it('maps HTTPException 429 to rate_limited', async () => {
    const ctx = mockCtx()
    const err = new HTTPException(429, { message: 'Too many requests' })
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(429)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('rate_limited')
  })

  it('maps HTTPException other status to internal_error', async () => {
    const ctx = mockCtx()
    const err = new HTTPException(502, { message: 'Bad gateway' })
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(502)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('internal_error')
  })

  it('maps ZodError to validation_error with issues', async () => {
    const ctx = mockCtx()
    const zodErr = new ZodError([
      {
        code: 'too_small',
        minimum: 1,
        type: 'string',
        path: ['name'],
        message: 'String must contain at least 1 character(s)',
        inclusive: true,
      } as any,
    ])
    const response = v2ErrorHandler(zodErr, ctx) as Response

    expect(response.status).toBe(400)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('validation_error')
    expect(Array.isArray(body.error.details)).toBe(true)
  })

  it('maps ZodError with search_too_long message to search_too_long', async () => {
    const ctx = mockCtx()
    const zodErr = new ZodError([
      {
        code: 'custom',
        path: ['search'],
        message: 'search_too_long',
      } as any,
    ])
    const response = v2ErrorHandler(zodErr, ctx) as Response

    expect(response.status).toBe(400)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('search_too_long')
  })

  it('handles unknown error with internal_error', async () => {
    const ctx = mockCtx()
    const err = new Error('Something went wrong')
    const response = v2ErrorHandler(err, ctx) as Response

    expect(response.status).toBe(500)
    const body = (await response.json()) as V2ErrorBody
    expect(body.error.code).toBe('internal_error')
  })
})
