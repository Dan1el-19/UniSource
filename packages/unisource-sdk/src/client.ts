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

async function apiRequest<T>(
  config: UnisourceClientConfig,
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal } = {}
): Promise<T> {
  const token = await config.getToken();

  const url = new URL(path, config.baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    'X-Service-ID': config.serviceId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
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

async function publicApiRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: { body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const url = new URL(path, baseUrl);
  const headers: Record<string, string> = {};
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

// ─── Client class ─────────────────────────────────────────────────────────────

export async function getPublicFileInfo(
  baseUrl: string,
  slug: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return publicApiRequest(baseUrl, 'GET', `/public/${encodeURIComponent(slug)}`, { signal });
}

export async function unlockPublicFile(
  baseUrl: string,
  slug: string,
  password: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return publicApiRequest(baseUrl, 'POST', `/public/${encodeURIComponent(slug)}/unlock`, {
    body: { password },
    signal,
  });
}

export class UnisourceClient {
  private config: UnisourceClientConfig;

  constructor(config: UnisourceClientConfig) {
    this.config = config;
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
    list: (query?: FileRecordsListQuery, signal?: AbortSignal): Promise<FileRecordsListResponse> =>
      apiRequest(this.config, 'GET', '/my-files', { query, signal }),

    /** List files in the trash */
    trash: (query?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<FileRecordsListResponse> =>
      apiRequest(this.config, 'GET', '/my-files/trash', { query, signal }),

    /** Get a single file record */
    get: (id: string, signal?: AbortSignal): Promise<FileRecordDetailResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}`, { signal }),

    /** Get a time-limited download URL (never cached by proxy) */
    downloadUrl: (id: string, signal?: AbortSignal): Promise<FileDownloadUrlResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}/download-url`, { signal }),

    /** Move file to a different folder (null = root) */
    move: (id: string, body: FileMoveRequest, signal?: AbortSignal): Promise<{ file: FileRecord }> =>
      apiRequest(this.config, 'PATCH', `/my-files/${id}/move`, { body, signal }),

    /** Soft-delete (move to trash) or permanently delete */
    delete: (id: string, query?: { permanent?: boolean }, signal?: AbortSignal): Promise<FileDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/my-files/${id}`, { query, signal }),

    /** Restore a file from trash */
    restore: (id: string, signal?: AbortSignal): Promise<FileRestoreResponse> =>
      apiRequest(this.config, 'POST', `/my-files/${id}/restore`, { signal }),

    /** Rename a file */
    update: (id: string, body: FileUpdateRequest, signal?: AbortSignal): Promise<FileUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/my-files/${id}`, { body, signal }),
  };

  // ─── Folders ──────────────────────────────────────────────────────────────

  readonly folders = {
    /** List folders owned by the authenticated user */
    list: (query?: FolderListQuery, signal?: AbortSignal): Promise<FolderListResponse> =>
      apiRequest(this.config, 'GET', '/folders', { query, signal }),

    /** Get a single folder by ID */
    get: (id: string, signal?: AbortSignal): Promise<FolderDetailResponse> =>
      apiRequest(this.config, 'GET', `/folders/${id}`, { signal }),

    /** Create a new folder */
    create: (body: FolderCreateRequest, signal?: AbortSignal): Promise<FolderCreateResponse> =>
      apiRequest(this.config, 'POST', '/folders', { body, signal }),

    /** Update folder name or color tag */
    update: (id: string, body: FolderUpdateRequest, signal?: AbortSignal): Promise<FolderUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/folders/${id}`, { body, signal }),

    /** Soft-delete or permanently delete a folder and its contents */
    delete: (id: string, query?: { permanent?: boolean }, signal?: AbortSignal): Promise<FolderDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/folders/${id}`, { query, signal }),

    /** Restore a folder from trash */
    restore: (id: string, signal?: AbortSignal): Promise<FolderRestoreResponse> =>
      apiRequest(this.config, 'POST', `/folders/${id}/restore`, { signal }),
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
