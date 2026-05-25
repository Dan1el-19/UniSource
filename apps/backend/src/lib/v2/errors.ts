import type { Context } from 'hono'

export type V2ErrorCode =
  | 'validation_error'
  | 'cursor_invalid'
  | 'search_too_long'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'internal_error'
  | 'conflict'
  | 'bad_gateway'

export class V2Error extends Error {
  constructor(
    public readonly code: V2ErrorCode,
    public readonly status: number,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message ?? code)
    this.name = 'V2Error'
  }
}

export interface V2ErrorBody {
  error: {
    code: V2ErrorCode
    message: string
    details?: unknown
    request_id: string
  }
}

export function errorResponse(c: Context, error: V2Error): Response {
  const body: V2ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      request_id: c.var.requestId ?? 'unknown',
    },
  }

  if (error.details !== undefined) {
    body.error.details = error.details
  }

  return c.json(body, error.status as any)
}
