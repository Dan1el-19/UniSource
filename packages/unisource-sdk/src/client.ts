import type { ApiError, UploadStatus } from './primitives';
import type {
  UploadR2InitRequest,
  UploadR2InitResponse,
  UploadAppwriteInitRequest,
  UploadAppwriteInitResponse,
  UploadLifecycleRequest,
  UploadCompleteResponse,
  UploadFailResponse,
  UploadsListResponse,
  UploadRecordDetailResponse,
} from './uploads';
import type {
  FileRecord,
  FileRecordsListQuery,
  FileRecordsListResponse,
  FileRecordDetailResponse,
  FileMoveRequest,
  FileDownloadUrlResponse,
  FileDeleteResponse,
  FileRestoreResponse,
  FileUpdateRequest,
  FileUpdateResponse,
} from './fileRecords';
import type {
  FolderListQuery,
  FolderListResponse,
  FolderDetailResponse,
  FolderCreateRequest,
  FolderCreateResponse,
  FolderUpdateRequest,
  FolderUpdateResponse,
  FolderDeleteResponse,
  FolderRestoreResponse,
} from './folders';
import type {
  ServiceDetailResponse,
  ServiceUsageResponse,
  AdminServiceUpdateRequest,
  AdminServiceUpdateResponse,
  AuditLogListQuery,
  AuditLogListResponse,
  AdminUserListResponse,
  AdminUserUpdateRequest,
  AdminUserUpdateResponse,
  AdminUserPasswordResetRequest,
  AdminUserPasswordResetResponse,
} from './services';
import type {
  ShareLinkCreateRequest,
  ShareLinkCreateResponse,
  ShareLinkListResponse,
  PublicFileAccessResponse,
  PublicFileLockedResponse,
  ShareLinkUpdateRequest,
  ShareLinkUpdateResponse,
  ShareLinkDeleteResponse,
} from './shareLinks';
import type {
  MainStorageListQuery,
  MainStorageListResponse,
  MainStorageDeleteResponse,
  MainStorageRestoreResponse,
} from './mainStorage';
import type {
  ReleaseDTO,
  ReleaseUploadInitRequest,
  ReleaseUploadInitResponse,
  ReleaseUploadCompleteRequest,
  ReleaseUploadCompleteResponse,
  ReleaseUploadFailResponse,
  ReleasesListQuery,
  ReleasesListResponse,
  ReleaseUpdateRequest,
  ReleaseDeleteResponse,
  ReleaseSyncRequest,
  ReleaseSyncResponse,
} from './releases';

// ─── SDK Error classes ────────────────────────────────────────────────────────

export class UnisourceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: ApiError
  ) {
    super(message);
    this.name = 'UnisourceError';
  }
}

export class UnisourceNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = 'UnisourceNetworkError';
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface UnisourceClientConfig {
  /** Base URL of the UniSource API, e.g. https://api.usrc.dev */
  baseUrl: string;
  /** Service identifier — tells the backend which service this client belongs to */
  serviceId: string;
  /**
   * Returns a fresh JWT or API key for each request.
   * Return null/undefined to send unauthenticated requests.
   */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
}

// ─── Internal fetch helper ────────────────────────────────────────────────────

async function fetchApi<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
    authHeaders?: Record<string, string>;
  } = {}
): Promise<T> {
  const url = new URL(path, baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = { ...options.authHeaders };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    throw new UnisourceNetworkError('Network request failed', err);
  }

  if (!response.ok) {
    let body: ApiError;
    try {
      body = (await response.json()) as ApiError;
    } catch {
      body = { error: 'Unknown', message: response.statusText };
    }
    throw new UnisourceError(body.message, response.status, body);
  }

  return response.json() as Promise<T>;
}

async function apiRequest<T>(
  config: UnisourceClientConfig,
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal; extraHeaders?: Record<string, string> } = {}
): Promise<T> {
  const token = await config.getToken();
  const authHeaders: Record<string, string> = {
    ...(options.extraHeaders ?? {}),
    'X-Service-ID': config.serviceId,
  };
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }
  return fetchApi<T>(config.baseUrl, method, path, { ...options, authHeaders });
}

// ─── Client class ─────────────────────────────────────────────────────────────

export async function getPublicFileInfo(
  baseUrl: string,
  slug: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return fetchApi(baseUrl, 'GET', `/public/${encodeURIComponent(slug)}`, { signal });
}

export async function unlockPublicFile(
  baseUrl: string,
  slug: string,
  password: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return fetchApi(baseUrl, 'POST', `/public/${encodeURIComponent(slug)}/unlock`, {
    body: { password },
    signal,
  });
}

export class UnisourceClient {
  private config: UnisourceClientConfig;

  constructor(config: UnisourceClientConfig) {
    this.config = config;
  }

  private request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal; extraHeaders?: Record<string, string> } = {}
  ): Promise<T> {
    return apiRequest<T>(this.config, method, path, options);
  }

  private withAsUser(options?: { asUser?: string }): Record<string, string> {
    return options?.asUser ? { 'X-Target-User-ID': options.asUser } : {};
  }

  // ─── Upload ────────────────────────────────────────────────────────────────

  readonly upload = {
    /** Initiate an R2 upload — returns a presigned PUT URL */
    r2Init: (body: UploadR2InitRequest, signal?: AbortSignal): Promise<UploadR2InitResponse> =>
      apiRequest(this.config, 'POST', '/upload/r2/init', { body, signal }),

    /** Initiate an Appwrite upload — returns credentials for direct SDK upload */
    appwriteInit: (body: UploadAppwriteInitRequest, signal?: AbortSignal): Promise<UploadAppwriteInitResponse> =>
      apiRequest(this.config, 'POST', '/upload/appwrite/init', { body, signal }),

    /** Confirm that the file was successfully uploaded to storage */
    complete: (body: UploadLifecycleRequest, signal?: AbortSignal): Promise<UploadCompleteResponse> =>
      apiRequest(this.config, 'POST', '/upload/complete', { body, signal }),

    /** Mark an upload as failed and release reserved quota */
    fail: (body: UploadLifecycleRequest, signal?: AbortSignal): Promise<UploadFailResponse> =>
      apiRequest(this.config, 'POST', '/upload/fail', { body, signal }),
  };

  // ─── My Files ─────────────────────────────────────────────────────────────

  readonly myFiles = {
    /** List files owned by the authenticated user */
    list: (query?: FileRecordsListQuery, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileRecordsListResponse> =>
      apiRequest(this.config, 'GET', '/my-files', { query, signal, extraHeaders: this.withAsUser(options) }),

    /** List files in the trash */
    trash: (query?: { cursor?: string; limit?: number }, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileRecordsListResponse> =>
      apiRequest(this.config, 'GET', '/my-files/trash', { query, signal, extraHeaders: this.withAsUser(options) }),

    /** Get a single file record */
    get: (id: string, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileRecordDetailResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}`, { signal, extraHeaders: this.withAsUser(options) }),

    /** Get a time-limited download URL (never cached by proxy) */
    downloadUrl: (id: string, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileDownloadUrlResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}/download-url`, { signal, extraHeaders: this.withAsUser(options) }),

    /** Move file to a different folder (null = root) */
    move: (id: string, body: FileMoveRequest, signal?: AbortSignal, options?: { asUser?: string }): Promise<{ file: FileRecord }> =>
      apiRequest(this.config, 'PATCH', `/my-files/${id}/move`, { body, signal, extraHeaders: this.withAsUser(options) }),

    /** Soft-delete (move to trash) or permanently delete */
    delete: (id: string, query?: { permanent?: boolean }, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/my-files/${id}`, { query, signal, extraHeaders: this.withAsUser(options) }),

    /** Restore a file from trash */
    restore: (id: string, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileRestoreResponse> =>
      apiRequest(this.config, 'POST', `/my-files/${id}/restore`, { signal, extraHeaders: this.withAsUser(options) }),

    /** Rename a file */
    update: (id: string, body: FileUpdateRequest, signal?: AbortSignal, options?: { asUser?: string }): Promise<FileUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/my-files/${id}`, { body, signal, extraHeaders: this.withAsUser(options) }),
  };

  // ─── Folders ──────────────────────────────────────────────────────────────

  readonly folders = {
    /** List folders owned by the authenticated user */
    list: (query?: FolderListQuery, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderListResponse> =>
      apiRequest(this.config, 'GET', '/folders', { query, signal, extraHeaders: this.withAsUser(options) }),

    /** Get a single folder by ID */
    get: (id: string, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderDetailResponse> =>
      apiRequest(this.config, 'GET', `/folders/${id}`, { signal, extraHeaders: this.withAsUser(options) }),

    /** Create a new folder */
    create: (body: FolderCreateRequest, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderCreateResponse> =>
      apiRequest(this.config, 'POST', '/folders', { body, signal, extraHeaders: this.withAsUser(options) }),

    /** Update folder name or color tag */
    update: (id: string, body: FolderUpdateRequest, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/folders/${id}`, { body, signal, extraHeaders: this.withAsUser(options) }),

    /** Soft-delete or permanently delete a folder and its contents */
    delete: (id: string, query?: { permanent?: boolean }, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/folders/${id}`, { query, signal, extraHeaders: this.withAsUser(options) }),

    /** Restore a folder from trash */
    restore: (id: string, signal?: AbortSignal, options?: { asUser?: string }): Promise<FolderRestoreResponse> =>
      apiRequest(this.config, 'POST', `/folders/${id}/restore`, { signal, extraHeaders: this.withAsUser(options) }),
  };

  // ─── Main Storage ─────────────────────────────────────────────────────────

  readonly mainStorage = {
    /** List files in the main storage pool */
    list: (query?: MainStorageListQuery): Promise<MainStorageListResponse> =>
      this.request('GET', '/main', { query }),

    /** Get a single main-storage file record */
    get: (fileId: string): Promise<FileRecord> =>
      this.request('GET', `/main/${fileId}`),

    /** Rename a main-storage file */
    rename: (fileId: string, filename: string): Promise<FileRecord> =>
      this.request('PATCH', `/main/${fileId}`, { body: { filename } }),

    /** Delete a main-storage file (soft by default; pass permanent=true for hard delete) */
    delete: (fileId: string, permanent = false): Promise<MainStorageDeleteResponse> =>
      this.request('DELETE', `/main/${fileId}${permanent ? '?permanent=true' : ''}`),

    /** Restore a soft-deleted main-storage file */
    restore: (fileId: string): Promise<MainStorageRestoreResponse> =>
      this.request('POST', `/main/${fileId}/restore`),

    upload: {
      /** Initiate an R2 upload targeting main storage */
      r2Init: (input: Omit<UploadR2InitRequest, 'is_main_storage'>): Promise<UploadR2InitResponse> =>
        this.request('POST', '/upload/r2/init', { body: { ...input, is_main_storage: true } }),

      /** Initiate an Appwrite upload targeting main storage */
      appwriteInit: (input: Omit<UploadAppwriteInitRequest, 'is_main_storage'>): Promise<UploadAppwriteInitResponse> =>
        this.request('POST', '/upload/appwrite/init', { body: { ...input, is_main_storage: true } }),

      /** Confirm a main-storage upload completed */
      complete: (uploadId: string): Promise<UploadCompleteResponse> =>
        this.request('POST', '/upload/complete', { body: { upload_id: uploadId, is_main_storage: true } }),

      /** Mark a main-storage upload as failed */
      fail: (uploadId: string): Promise<UploadFailResponse> =>
        this.request('POST', '/upload/fail', { body: { upload_id: uploadId } }),
    },
  };

  // ─── Releases ─────────────────────────────────────────────────────────────

  readonly releases = {
    upload: {
      /** Initiate a release upload — returns a presigned PUT URL */
      init: (body: ReleaseUploadInitRequest, signal?: AbortSignal): Promise<ReleaseUploadInitResponse> =>
        apiRequest(this.config, 'POST', '/releases/upload/init', { body, signal }),

      /** Confirm that a release object was successfully uploaded */
      complete: (body: ReleaseUploadCompleteRequest, signal?: AbortSignal): Promise<ReleaseUploadCompleteResponse> =>
        apiRequest(this.config, 'POST', '/releases/upload/complete', { body, signal }),

      /** Mark a release upload as failed */
      fail: (releaseId: string, signal?: AbortSignal): Promise<ReleaseUploadFailResponse> =>
        apiRequest(this.config, 'POST', '/releases/upload/fail', { body: { release_id: releaseId }, signal }),
    },

    /** List releases for the configured service */
    list: (query?: ReleasesListQuery, signal?: AbortSignal): Promise<ReleasesListResponse> =>
      apiRequest(this.config, 'GET', '/releases', { query, signal }),

    /** Get a single release */
    get: (releaseId: string, signal?: AbortSignal): Promise<ReleaseDTO> =>
      apiRequest(this.config, 'GET', `/releases/${releaseId}`, { signal }),

    /** Get the latest completed release */
    latest: (signal?: AbortSignal): Promise<ReleaseDTO> =>
      apiRequest(this.config, 'GET', '/releases/latest', { signal }),

    /** Update release metadata */
    update: (releaseId: string, body: ReleaseUpdateRequest, signal?: AbortSignal): Promise<ReleaseDTO> =>
      apiRequest(this.config, 'PATCH', `/releases/${releaseId}`, { body, signal }),

    /** Delete a release and its completed object, when applicable */
    delete: (releaseId: string, signal?: AbortSignal): Promise<ReleaseDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/releases/${releaseId}`, { signal }),

    /** Sync existing release manifests into the backend */
    sync: (body: ReleaseSyncRequest, signal?: AbortSignal): Promise<ReleaseSyncResponse> =>
      apiRequest(this.config, 'POST', '/releases/sync', { body, signal }),
  };

  // ─── Admin ────────────────────────────────────────────────────────────────

  readonly admin = {
    /** Get service info and quota limits */
    serviceDetail: (signal?: AbortSignal): Promise<ServiceDetailResponse> =>
      apiRequest(this.config, 'GET', '/admin/service', { signal }),

    /** Update custom service-wide limits */
    updateService: (body: AdminServiceUpdateRequest, signal?: AbortSignal): Promise<AdminServiceUpdateResponse> =>
      apiRequest(this.config, 'PATCH', '/admin/service', { body, signal }),

    /** Get real-time storage usage for the service */
    usage: (signal?: AbortSignal): Promise<ServiceUsageResponse> =>
      apiRequest(this.config, 'GET', '/admin/service/usage', { signal }),

    /** List all uploads (pending/completed/failed) for this service */
    listUploads: (query?: { status?: UploadStatus; cursor?: string; limit?: number }, signal?: AbortSignal): Promise<UploadsListResponse> =>
      apiRequest(this.config, 'GET', '/files', { query, signal }),

    /** Get a single upload for this service */
    getUpload: (id: string, signal?: AbortSignal): Promise<UploadRecordDetailResponse> =>
      apiRequest(this.config, 'GET', `/files/${id}`, { signal }),

    /** Get a time-limited download URL for an upload owned by this service */
    downloadUploadUrl: (id: string, signal?: AbortSignal): Promise<FileDownloadUrlResponse> =>
      apiRequest(this.config, 'GET', `/files/${id}/download-url`, { signal }),

    /** Permanently delete an upload owned by this service */
    deleteUpload: (id: string, signal?: AbortSignal): Promise<FileDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/files/${id}`, { signal }),

    /** List audit log events for this service */
    auditLog: (query?: AuditLogListQuery, signal?: AbortSignal): Promise<AuditLogListResponse> =>
      apiRequest(this.config, 'GET', '/admin/audit-log', { query, signal }),

    /** List Appwrite users together with service-specific metadata */
    listUsers: (
      query?: { search?: string; offset?: number; limit?: number },
      signal?: AbortSignal
    ): Promise<AdminUserListResponse> => apiRequest(this.config, 'GET', '/admin/users', { query, signal }),

    /** Update Appwrite user properties and service-specific quota/role */
    updateUser: (
      userId: string,
      body: AdminUserUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminUserUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/admin/users/${userId}`, { body, signal }),

    /** Overwrite a user's password and revoke active sessions */
    resetUserPassword: (
      userId: string,
      body: AdminUserPasswordResetRequest,
      signal?: AbortSignal
    ): Promise<AdminUserPasswordResetResponse> =>
      apiRequest(this.config, 'POST', `/admin/users/${userId}/password`, { body, signal }),
  };

  // ─── Share Links ──────────────────────────────────────────────────────────────

  readonly shareLinks = {
    /** Create a public share link for a file */
    create: (fileId: string, body: ShareLinkCreateRequest, signal?: AbortSignal): Promise<ShareLinkCreateResponse> =>
      apiRequest(this.config, 'POST', `/my-files/${fileId}/share-links`, { body, signal }),

    /** List all share links for a file */
    list: (fileId: string, signal?: AbortSignal): Promise<ShareLinkListResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${fileId}/share-links`, { signal }),

    /** Update a share link (rename, toggle, change password/expiry) */
    update: (linkId: string, body: ShareLinkUpdateRequest, signal?: AbortSignal): Promise<ShareLinkUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/share-links/${linkId}`, { body, signal }),

    /** Permanently delete a share link */
    delete: (linkId: string, signal?: AbortSignal): Promise<ShareLinkDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/share-links/${linkId}`, { signal }),
  };
}
