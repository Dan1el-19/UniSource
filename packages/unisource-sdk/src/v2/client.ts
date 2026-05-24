import type { V2ListQuery, V2ListResponse } from './types'
import type { V2File } from './files'
import { v2ListResponseSchema } from './schemas'
import { v2FileSchema } from './files'
import { UnisourceV2Error } from './errors'

let warned = false

export interface UnisourceV2ClientConfig {
  baseUrl: string
  serviceId: string
  getToken: () => string | null | undefined | Promise<string | null | undefined>
  /** Set to true to suppress the beta warning in console */
  silentBeta?: boolean
}

export class UnisourceV2Client {
  private config: UnisourceV2ClientConfig

  constructor(config: UnisourceV2ClientConfig) {
    this.config = config
    if (!warned && !config.silentBeta) {
      console.warn(
        '[unisource-sdk] V2 API is in beta. Breaking changes possible. ' +
        'See https://docs.unisource.example/v2 for stability commitments.'
      )
      warned = true
    }
  }

  readonly files = {
    list: (
      query?: V2ListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ListResponse<V2File>> => this._filesList(query, signal, options),
  }

  private async _filesList(
    query?: V2ListQuery,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2ListResponse<V2File>> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/files', this.config.baseUrl)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue
        url.searchParams.set(k, v === null ? 'null' : String(v))
      }
    }

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'GET', headers, signal })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let body: { error?: { code?: string; message?: string; details?: unknown } }
      try { body = await response.json() } catch { body = {} }
      throw new UnisourceV2Error(
        body.error?.message ?? response.statusText,
        response.status,
        body.error?.code ?? 'unknown',
        requestId,
        body.error?.details
      )
    }

    const data = await response.json()
    return v2ListResponseSchema(v2FileSchema).parse(data)
  }
}
