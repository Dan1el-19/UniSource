import type { ApiError } from './primitives';

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
  /** Base URL of the UniSource API, e.g. https://api.example.com */
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
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null> } = {}
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

import type {
  UploadR2InitRequest,
  UploadR2InitResponse,
  UploadAppwriteInitRequest,
  UploadAppwriteInitResponse,
  UploadLifecycleRequest,
  UploadCompleteResponse,
  UploadFailResponse,
  UploadsListResponse,
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
} from './fileRecords';

import type {
  FolderListQuery,
  FolderListResponse,
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
  AuditLogListQuery,
  AuditLogListResponse,
} from './services';

export class UnisourceClient {
  private config: UnisourceClientConfig;

  constructor(config: UnisourceClientConfig) {
    this.config = config;
  }

  // ─── Upload ────────────────────────────────────────────────────────────────

  readonly upload = {
    /** Initiate an R2 upload — returns a presigned PUT URL */
    r2Init: (body: UploadR2InitRequest): Promise<UploadR2InitResponse> =>
      apiRequest(this.config, 'POST', '/upload/r2/init', { body }),

    /** Initiate an Appwrite upload — returns credentials for direct SDK upload */
    appwriteInit: (body: UploadAppwriteInitRequest): Promise<UploadAppwriteInitResponse> =>
      apiRequest(this.config, 'POST', '/upload/appwrite/init', { body }),

    /** Confirm that the file was successfully uploaded to storage */
    complete: (body: UploadLifecycleRequest): Promise<UploadCompleteResponse> =>
      apiRequest(this.config, 'POST', '/upload/complete', { body }),

    /** Mark an upload as failed and release reserved quota */
    fail: (body: UploadLifecycleRequest): Promise<UploadFailResponse> =>
      apiRequest(this.config, 'POST', '/upload/fail', { body }),
  };

  // ─── My Files ─────────────────────────────────────────────────────────────

  readonly myFiles = {
    /** List files owned by the authenticated user */
    list: (query?: FileRecordsListQuery): Promise<FileRecordsListResponse> =>
      apiRequest(this.config, 'GET', '/my-files', { query }),

    /** Get a single file record */
    get: (id: string): Promise<FileRecordDetailResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}`),

    /** Get a time-limited download URL (never cached by proxy) */
    downloadUrl: (id: string): Promise<FileDownloadUrlResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${id}/download-url`),

    /** Move file to a different folder (null = root) */
    move: (id: string, body: FileMoveRequest): Promise<{ file: FileRecord }> =>
      apiRequest(this.config, 'PATCH', `/my-files/${id}/move`, { body }),

    /** Soft-delete (move to trash) or permanently delete */
    delete: (id: string, query?: { permanent?: boolean }): Promise<FileDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/my-files/${id}`, { query }),

    /** Restore a file from trash */
    restore: (id: string): Promise<FileRestoreResponse> =>
      apiRequest(this.config, 'POST', `/my-files/${id}/restore`),
  };

  // ─── Folders ──────────────────────────────────────────────────────────────

  readonly folders = {
    /** List folders owned by the authenticated user */
    list: (query?: FolderListQuery): Promise<FolderListResponse> =>
      apiRequest(this.config, 'GET', '/folders', { query }),

    /** Create a new folder */
    create: (body: FolderCreateRequest): Promise<FolderCreateResponse> =>
      apiRequest(this.config, 'POST', '/folders', { body }),

    /** Update folder name or color tag */
    update: (id: string, body: FolderUpdateRequest): Promise<FolderUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/folders/${id}`, { body }),

    /** Soft-delete or permanently delete a folder and its contents */
    delete: (id: string, query?: { permanent?: boolean }): Promise<FolderDeleteResponse> =>
      apiRequest(this.config, 'DELETE', `/folders/${id}`, { query }),

    /** Restore a folder from trash */
    restore: (id: string): Promise<FolderRestoreResponse> =>
      apiRequest(this.config, 'POST', `/folders/${id}/restore`),
  };

  // ─── Admin ────────────────────────────────────────────────────────────────

  readonly admin = {
    /** Get service info and quota limits */
    serviceDetail: (): Promise<ServiceDetailResponse> =>
      apiRequest(this.config, 'GET', '/admin/service'),

    /** Get real-time storage usage for the service */
    usage: (): Promise<ServiceUsageResponse> =>
      apiRequest(this.config, 'GET', '/admin/service/usage'),

    /** List all uploads (pending/completed/failed) for this service */
    listUploads: (query?: { status?: string; cursor?: string; limit?: number }): Promise<UploadsListResponse> =>
      apiRequest(this.config, 'GET', '/files', { query }),

    /** List audit log events for this service */
    auditLog: (query?: AuditLogListQuery): Promise<AuditLogListResponse> =>
      apiRequest(this.config, 'GET', '/admin/audit-log', { query }),
  };
}
