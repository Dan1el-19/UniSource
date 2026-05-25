import type { V2ListQuery, V2ListResponse } from './types'
import type { V2File } from './files'
import type { V2FolderListQuery, V2FolderListResponse, V2FolderBreadcrumbsResponse } from './folders'
import type { BulkFileIds, BulkFileMoveRequest, BulkFolderIds, BulkFolderMoveRequest, BulkOperationResponse } from './legacy-draft'
import { v2ListResponseSchema } from './schemas'
import { v2FileSchema } from './files'
import { v2FolderListResponseSchema, v2FolderBreadcrumbsResponseSchema } from './folders'
import { bulkOperationResponseSchema } from './legacy-draft'
import { UnisourceV2Error } from './errors'

let warned = false

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
    bulkTrash: (
      body: BulkFileIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._filesBulkTrash(body, signal, options),
  }

  readonly folders = {
    list: (
      query?: V2FolderListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderListResponse> => this._foldersList(query, signal, options),
    breadcrumbs: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderBreadcrumbsResponse> => this._foldersBreadcrumbs(id, signal, options),
    bulkTrash: (
      body: BulkFolderIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._foldersBulkTrash(body, signal, options),
    bulkRestore: (
      body: BulkFolderIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._foldersBulkRestore(body, signal, options),
    bulkMove: (
      body: BulkFolderMoveRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._foldersBulkMove(body, signal, options),
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
    return v2ListResponseSchema(v2FileSchema).parse(data)
  }

  private async _foldersList(
    query?: V2FolderListQuery,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2FolderListResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/folders', this.config.baseUrl)
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
    return v2FolderListResponseSchema.parse(data)
  }

  private async _foldersBreadcrumbs(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2FolderBreadcrumbsResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/v2/folders/${encodeURIComponent(id)}/breadcrumbs`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'GET', headers, signal })
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
    return v2FolderBreadcrumbsResponseSchema.parse(data)
  }

  private async _foldersBulkTrash(
    body: BulkFolderIds,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<BulkOperationResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/folders/bulk-trash', this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let errBody: V2ErrorBody
      try { errBody = parseErrorBody(await response.json()) } catch { errBody = {} }
      throw new UnisourceV2Error(
        errBody.error?.message ?? response.statusText,
        response.status,
        errBody.error?.code ?? 'unknown',
        requestId,
        errBody.error?.details
      )
    }

    const data = await response.json()
    return bulkOperationResponseSchema.parse(data)
  }

  private async _foldersBulkRestore(
    body: BulkFolderIds,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<BulkOperationResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/folders/bulk-restore', this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let errBody: V2ErrorBody
      try { errBody = parseErrorBody(await response.json()) } catch { errBody = {} }
      throw new UnisourceV2Error(
        errBody.error?.message ?? response.statusText,
        response.status,
        errBody.error?.code ?? 'unknown',
        requestId,
        errBody.error?.details
      )
    }

    const data = await response.json()
    return bulkOperationResponseSchema.parse(data)
  }

  private async _foldersBulkMove(
    body: BulkFolderMoveRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<BulkOperationResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/folders/bulk-move', this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let errBody: V2ErrorBody
      try { errBody = parseErrorBody(await response.json()) } catch { errBody = {} }
      throw new UnisourceV2Error(
        errBody.error?.message ?? response.statusText,
        response.status,
        errBody.error?.code ?? 'unknown',
        requestId,
        errBody.error?.details
      )
    }

    const data = await response.json()
    return bulkOperationResponseSchema.parse(data)
  }

  private async _filesBulkTrash(
    body: BulkFileIds,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<BulkOperationResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/v2/files/bulk-trash', this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, body: JSON.stringify(body), signal })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let errBody: V2ErrorBody
      try { errBody = parseErrorBody(await response.json()) } catch { errBody = {} }
      throw new UnisourceV2Error(
        errBody.error?.message ?? response.statusText,
        response.status,
        errBody.error?.code ?? 'unknown',
        requestId,
        errBody.error?.details
      )
    }

    const data = await response.json()
    return bulkOperationResponseSchema.parse(data)
  }
}
