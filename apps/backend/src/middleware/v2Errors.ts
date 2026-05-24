import type { Context, ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { V2Error, errorResponse } from '../lib/v2/errors'

export const v2ErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof V2Error) {
    return errorResponse(c, err)
  }

  if (err instanceof HTTPException) {
    const code =
      err.status === 401
        ? 'unauthorized'
        : err.status === 403
          ? 'forbidden'
          : err.status === 429
            ? 'rate_limited'
            : 'internal_error'
    return errorResponse(c, new V2Error(code, err.status, err.message))
  }

  if (err instanceof ZodError) {
    const tooLong = err.issues.find((i) => i.message === 'search_too_long')
    if (tooLong) {
      return errorResponse(c, new V2Error('search_too_long', 400, 'Search query too long'))
    }
    return errorResponse(c, new V2Error('validation_error', 400, 'Invalid request', err.issues))
  }

  console.error('v2 unhandled error:', err)
  return errorResponse(c, new V2Error('internal_error', 500, 'Internal server error'))
}
