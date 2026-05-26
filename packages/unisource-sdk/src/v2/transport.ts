import type { UnisourceV2ClientConfig } from './client'
import { UnisourceV2Error } from './errors'

export type V2HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type V2Query = object

export interface V2ResponseParser<T> {
  parse: (value: unknown) => T
}

export interface V2RequestOptions<T> {
  body?: unknown
  query?: V2Query
  signal?: AbortSignal
  asUser?: string
  parser: V2ResponseParser<T>
}

export type V2Request = <T>(
  method: V2HttpMethod,
  path: string,
  options: V2RequestOptions<T>
) => Promise<T>

type V2ErrorBody = { error?: { code?: string; message?: string; details?: unknown } }

function parseErrorBody(value: unknown): V2ErrorBody {
  if (!value || typeof value !== 'object') return {}

  const error = (value as { error?: unknown }).error
  if (!error || typeof error !== 'object') return {}

  const payload = error as Record<string, unknown>
  return {
    error: {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      details: payload.details,
    },
  }
}

export function createV2Request(config: UnisourceV2ClientConfig): V2Request {
  return async function request<T>(
    method: V2HttpMethod,
    path: string,
    options: V2RequestOptions<T>
  ): Promise<T> {
    const token = await config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': config.serviceId,
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options.asUser) headers['X-Target-User-ID'] = options.asUser
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    const url = new URL(path, config.baseUrl)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue
        url.searchParams.set(key, value === null ? 'null' : String(value))
      }
    }

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let body: V2ErrorBody
      try { body = parseErrorBody(await response.json()) } catch { body = {} }
      throw new UnisourceV2Error(
        body.error?.message ?? response.statusText,
        response.status,
        body.error?.code ?? 'unknown',
        requestId,
        body.error?.details
      )
    }

    const data = await response.json()
    return options.parser.parse(data)
  }
}
