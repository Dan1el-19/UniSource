// ─── Primitives ───────────────────────────────────────────────────────────────
export {
  nonEmptyString,
  positiveInt,
  unixTimestamp,
  uploadDestinationSchema,
  uploadStatusSchema,
  apiErrorSchema,
} from './primitives';
export type { UploadDestination, UploadStatus, ApiError } from './primitives';

// ─── Upload ───────────────────────────────────────────────────────────────────
export {
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
  uploadR2InitRequestSchema,
  uploadR2InitResponseSchema,
  uploadAppwriteInitRequestSchema,
  uploadAppwriteInitResponseSchema,
  uploadLifecycleRequestSchema,
  uploadCompleteResponseSchema,
  uploadFailResponseSchema,
  uploadRecordSchema,
  uploadsListResponseSchema,
} from './uploads';
export type {
  UploadR2InitRequest,
  UploadR2InitResponse,
  UploadAppwriteInitRequest,
  UploadAppwriteInitResponse,
  UploadLifecycleRequest,
  UploadCompleteResponse,
  UploadFailResponse,
  UploadRecord,
  UploadsListResponse,
} from './uploads';

// ─── File Records ─────────────────────────────────────────────────────────────
export {
  fileRecordSchema,
  fileRecordsListQuerySchema,
  fileRecordsListResponseSchema,
  fileRecordDetailResponseSchema,
  fileMoveRequestSchema,
  fileDownloadUrlResponseSchema,
  fileDeleteResponseSchema,
  fileRestoreResponseSchema,
} from './fileRecords';
export type {
  FileRecord,
  FileRecordsListQuery,
  FileRecordsListResponse,
  FileRecordDetailResponse,
  FileMoveRequest,
  FileDownloadUrlResponse,
  FileDeleteResponse,
  FileRestoreResponse,
} from './fileRecords';

// ─── Folders ─────────────────────────────────────────────────────────────────
export {
  folderSchema,
  folderListQuerySchema,
  folderListResponseSchema,
  folderDetailResponseSchema,
  folderCreateRequestSchema,
  folderCreateResponseSchema,
  folderUpdateRequestSchema,
  folderUpdateResponseSchema,
  folderDeleteResponseSchema,
  folderRestoreResponseSchema,
} from './folders';
export type {
  Folder,
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

// ─── Services & Audit ─────────────────────────────────────────────────────────
export {
  serviceSchema,
  serviceDetailResponseSchema,
  serviceUsageResponseSchema,
  auditEventActionSchema,
  auditEventSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
} from './services';
export type {
  Service,
  ServiceDetailResponse,
  ServiceUsageResponse,
  AuditEventAction,
  AuditEvent,
  AuditLogListQuery,
  AuditLogListResponse,
} from './services';

// ─── HTTP Client ─────────────────────────────────────────────────────────────
export { UnisourceClient, UnisourceError, UnisourceNetworkError } from './client';
export type { UnisourceClientConfig } from './client';
