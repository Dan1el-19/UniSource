import type { V2ListQuery, V2ListResponse } from './types'
import type { V2File } from './files'
import type { V2FolderListQuery, V2FolderListResponse, V2FolderBreadcrumbsResponse } from './folders'
import type { BulkFileIds, BulkFileMoveRequest, BulkFolderIds, BulkFolderMoveRequest, BulkOperationResponse } from './legacy-draft'
import { v2ListResponseSchema } from './schemas'
import { v2FileSchema } from './files'
import { v2FolderListResponseSchema, v2FolderBreadcrumbsResponseSchema } from './folders'
import { bulkOperationResponseSchema } from './legacy-draft'
import { UnisourceV2Error } from './errors'
import type { ShareLinkListResponse, ShareLinkCreateResponse, ShareLinkDetailResponse, ShareLinkDeleteResponse, SharesCreateRequest, ShareLinkCreateRequest, ShareLinkUpdateRequest, ShareLinkUpdateResponse } from '../shareLinks'
import { shareLinkListResponseSchema, shareLinkCreateResponseSchema, shareLinkDetailResponseSchema, shareLinkDeleteResponseSchema, shareLinkUpdateResponseSchema } from '../shareLinks'
import type { AppReleaseLatestResponse } from '../releases'
import { appReleaseLatestResponseSchema } from '../releases'
import type { MainStorageListQuery, MainStorageListResponse, MainStorageDetailResponse, MainStorageRenameRequest, MainStorageRenameResponse, MainStorageDeleteResponse, MainStorageRestoreResponse } from '../mainStorage'
import { mainStorageListResponseSchema, mainStorageDetailResponseSchema, mainStorageRenameResponseSchema, mainStorageDeleteResponseSchema, mainStorageRestoreResponseSchema } from '../mainStorage'
import type { FileRecordDetailResponse, FileUpdateRequest, FileUpdateResponse, FileDeleteResponse, FileRestoreResponse, FileDownloadUrlResponse } from '../fileRecords'
import { fileRecordDetailResponseSchema, fileUpdateResponseSchema, fileDeleteResponseSchema, fileRestoreResponseSchema, fileDownloadUrlResponseSchema } from '../fileRecords'

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
    bulkRestore: (
      body: BulkFileIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._filesBulkRestore(body, signal, options),
    bulkMove: (
      body: BulkFileMoveRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> => this._filesBulkMove(body, signal, options),
  }

  readonly shares = {
    list: (
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkListResponse> => this._sharesList(signal, options),
    create: (
      body: SharesCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkCreateResponse> => this._sharesCreate(body, signal, options),
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDetailResponse> => this._sharesGet(id, signal, options),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDeleteResponse> => this._sharesDelete(id, signal, options),
  }

  readonly app = {
    latestRelease: (
      query?: { channel?: string },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<AppReleaseLatestResponse> => this._appLatestRelease(query, signal, options),
  }

  readonly shareLinks = {
    create: (
      fileId: string,
      body: ShareLinkCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkCreateResponse> => this._shareLinksCreate(fileId, body, signal, options),
    listForFile: (
      fileId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkListResponse> => this._shareLinksListForFile(fileId, signal, options),
    update: (
      linkId: string,
      body: ShareLinkUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkUpdateResponse> => this._shareLinksUpdate(linkId, body, signal, options),
    delete: (
      linkId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDeleteResponse> => this._shareLinksDelete(linkId, signal, options),
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

  readonly mainStorage = {
    list: (
      query?: MainStorageListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageListResponse> => this._mainStorageList(query, signal, options),
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageDetailResponse> => this._mainStorageGet(id, signal, options),
    update: (
      id: string,
      body: MainStorageRenameRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageRenameResponse> => this._mainStorageUpdate(id, body, signal, options),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<MainStorageDeleteResponse> => this._mainStorageDelete(id, signal, options),
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageRestoreResponse> => this._mainStorageRestore(id, signal, options),
  }

  readonly userFiles = {
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileRecordDetailResponse> => this._userFilesGet(id, signal, options),
    update: (
      id: string,
      body: FileUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileUpdateResponse> => this._userFilesUpdate(id, body, signal, options),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<FileDeleteResponse> => this._userFilesDelete(id, signal, options),
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileRestoreResponse> => this._userFilesRestore(id, signal, options),
    downloadUrl: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileDownloadUrlResponse> => this._userFilesDownloadUrl(id, signal, options),
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

  private async _filesBulkRestore(
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

    const url = new URL('/v2/files/bulk-restore', this.config.baseUrl)

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

  private async _filesBulkMove(
    body: BulkFileMoveRequest,
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

    const url = new URL('/v2/files/bulk-move', this.config.baseUrl)

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

  private async _sharesList(
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkListResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/shares', this.config.baseUrl)

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
    return shareLinkListResponseSchema.parse(data)
  }

  private async _sharesCreate(
    body: SharesCreateRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkCreateResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/shares', this.config.baseUrl)

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
    return shareLinkCreateResponseSchema.parse(data)
  }

  private async _sharesGet(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkDetailResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/shares/${encodeURIComponent(id)}`, this.config.baseUrl)

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
    return shareLinkDetailResponseSchema.parse(data)
  }

  private async _sharesDelete(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkDeleteResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/shares/${encodeURIComponent(id)}`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'DELETE', headers, signal })
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
    return shareLinkDeleteResponseSchema.parse(data)
  }

  private async _shareLinksCreate(
    fileId: string,
    body: ShareLinkCreateRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkCreateResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/my-files/${encodeURIComponent(fileId)}/share-links`, this.config.baseUrl)

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
    return shareLinkCreateResponseSchema.parse(data)
  }

  private async _shareLinksListForFile(
    fileId: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkListResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/my-files/${encodeURIComponent(fileId)}/share-links`, this.config.baseUrl)

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
    return shareLinkListResponseSchema.parse(data)
  }

  private async _shareLinksUpdate(
    linkId: string,
    body: ShareLinkUpdateRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkUpdateResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/share-links/${encodeURIComponent(linkId)}`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'PATCH', headers, body: JSON.stringify(body), signal })
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
    return shareLinkUpdateResponseSchema.parse(data)
  }

  private async _shareLinksDelete(
    linkId: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<ShareLinkDeleteResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/share-links/${encodeURIComponent(linkId)}`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'DELETE', headers, signal })
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
    return shareLinkDeleteResponseSchema.parse(data)
  }

  private async _appLatestRelease(
    query?: { channel?: string },
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<AppReleaseLatestResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/app/releases/latest', this.config.baseUrl)
    if (query?.channel !== undefined) url.searchParams.set('channel', query.channel)

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
    return appReleaseLatestResponseSchema.parse(data)
  }

  private async _mainStorageList(
    query?: MainStorageListQuery,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<MainStorageListResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL('/main', this.config.baseUrl)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue
        url.searchParams.set(k, String(v))
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
    return mainStorageListResponseSchema.parse(data)
  }

  private async _mainStorageGet(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<MainStorageDetailResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/main/${encodeURIComponent(id)}`, this.config.baseUrl)

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
    return mainStorageDetailResponseSchema.parse(data)
  }

  private async _mainStorageUpdate(
    id: string,
    body: MainStorageRenameRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<MainStorageRenameResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/main/${encodeURIComponent(id)}`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'PATCH', headers, body: JSON.stringify(body), signal })
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
    return mainStorageRenameResponseSchema.parse(data)
  }

  private async _mainStorageDelete(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string; permanent?: boolean }
  ): Promise<MainStorageDeleteResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/main/${encodeURIComponent(id)}`, this.config.baseUrl)
    if (options?.permanent) url.searchParams.set('permanent', 'true')

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'DELETE', headers, signal })
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
    return mainStorageDeleteResponseSchema.parse(data)
  }

  private async _mainStorageRestore(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<MainStorageRestoreResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/main/${encodeURIComponent(id)}/restore`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, signal })
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
    return mainStorageRestoreResponseSchema.parse(data)
  }

  private async _userFilesGet(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<FileRecordDetailResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/files/${encodeURIComponent(id)}`, this.config.baseUrl)

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
    return fileRecordDetailResponseSchema.parse(data)
  }

  private async _userFilesUpdate(
    id: string,
    body: FileUpdateRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<FileUpdateResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = {
      'X-Service-ID': this.config.serviceId,
      'Content-Type': 'application/json',
    }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/files/${encodeURIComponent(id)}`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'PATCH', headers, body: JSON.stringify(body), signal })
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
    return fileUpdateResponseSchema.parse(data)
  }

  private async _userFilesDelete(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string; permanent?: boolean }
  ): Promise<FileDeleteResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/files/${encodeURIComponent(id)}`, this.config.baseUrl)
    if (options?.permanent) url.searchParams.set('permanent', 'true')

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'DELETE', headers, signal })
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
    return fileDeleteResponseSchema.parse(data)
  }

  private async _userFilesRestore(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<FileRestoreResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/files/${encodeURIComponent(id)}/restore`, this.config.baseUrl)

    let response: Response
    try {
      response = await fetch(url.toString(), { method: 'POST', headers, signal })
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
    return fileRestoreResponseSchema.parse(data)
  }

  private async _userFilesDownloadUrl(
    id: string,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<FileDownloadUrlResponse> {
    const token = await this.config.getToken()
    const headers: Record<string, string> = { 'X-Service-ID': this.config.serviceId }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (options?.asUser) headers['X-Target-User-ID'] = options.asUser

    const url = new URL(`/files/${encodeURIComponent(id)}/download-url`, this.config.baseUrl)

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
    return fileDownloadUrlResponseSchema.parse(data)
  }
}
