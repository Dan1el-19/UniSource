import type { UnisourceV2ClientConfig } from './client'
import type { V2ErrorCode } from './error-codes'
import { isV2ErrorCode } from './error-codes'
import { UnisourceV2Error } from './errors'

export type V2HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type V2AuthMode = 'default' | 'none'

export type V2Query = object

export interface V2ResponseParser<T> {
  parse: (value: unknown) => T
}

export interface V2RequestOptions<T> {
  body?: unknown
  query?: V2Query
  signal?: AbortSignal
  asUser?: string
  /**
   * Override authentication for this request.
   * - 'default' (or omitted): use apiKey or getToken from client config.
   * - 'none': do NOT send Authorization header, even if credentials are configured.
   *   Used by client.public.* for anonymous endpoints.
   */
  auth?: V2AuthMode
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

async function resolveAuthHeader(
  config: UnisourceV2ClientConfig,
  authMode: V2AuthMode
): Promise<string | undefined> {
  if (authMode === 'none') return undefined
  if (config.apiKey) return `Bearer ${config.apiKey}`
  if (config.getToken) {
    const token = await config.getToken()
    if (token) return `Bearer ${token}`
  }
  return undefined
}

export function createV2Request(config: UnisourceV2ClientConfig): V2Request {
  return async function request<T>(
    method: V2HttpMethod,
    path: string,
    options: V2RequestOptions<T>
  ): Promise<T> {
    const authMode: V2AuthMode = options.auth ?? 'default'
    const authHeader = await resolveAuthHeader(config, authMode)

    const headers: Record<string, string> = {
      'X-Service-ID': config.serviceId,
      'X-Unisource-API-Version': '2',
      Accept: 'application/vnd.unisource.v2+json',
    }
    if (authHeader) headers['Authorization'] = authHeader
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

      const rawCode = body.error?.code
      const code: V2ErrorCode | 'unknown' =
        rawCode && isV2ErrorCode(rawCode) ? rawCode : 'unknown'
      const rawCodeForError = code === 'unknown' && rawCode ? rawCode : undefined

      throw new UnisourceV2Error(
        body.error?.message ?? response.statusText,
        response.status,
        code,
        requestId,
        body.error?.details,
        rawCodeForError
      )
    }

    const data = await response.json()
    return options.parser.parse(data)
  }
}
