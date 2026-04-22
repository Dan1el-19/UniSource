// ─── Primitives ───────────────────────────────────────────────────────────────
export {
  nonEmptyString,
  positiveInt,
  unixTimestamp,
  uploadDestinationSchema,
  uploadStatusSchema,
  apiErrorSchema,
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
} from './primitives';
export type { UploadDestination, UploadStatus, ApiError } from './primitives';


// ─── Upload ───────────────────────────────────────────────────────────────────
export {
  uploadR2InitRequestSchema,
  uploadR2InitResponseSchema,
  uploadAppwriteInitRequestSchema,
  uploadAppwriteInitResponseSchema,
  uploadLifecycleRequestSchema,
  uploadCompleteResponseSchema,
  uploadFailResponseSchema,
  uploadRecordSchema,
  uploadsListResponseSchema,
  uploadRecordDetailResponseSchema,
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
  UploadRecordDetailResponse,
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
  fileUpdateRequestSchema,
  fileUpdateResponseSchema,
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
  FileUpdateRequest,
  FileUpdateResponse,
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
  adminServiceUpdateRequestSchema,
  adminServiceUpdateResponseSchema,
  serviceUsageResponseSchema,
  auditEventActionSchema,
  auditEventSchema,
  auditLogListQuerySchema,
  auditLogListResponseSchema,
  adminUserSchema,
  adminUserListResponseSchema,
  adminUserUpdateRequestSchema,
  adminUserUpdateResponseSchema,
  adminUserPasswordResetRequestSchema,
  adminUserPasswordResetResponseSchema,
} from './services';
export type {
  Service,
  ServiceDetailResponse,
  AdminServiceUpdateRequest,
  AdminServiceUpdateResponse,
  ServiceUsageResponse,
  AuditEventAction,
  AuditEvent,
  AuditLogListQuery,
  AuditLogListResponse,
  AdminUser,
  AdminUserListResponse,
  AdminUserUpdateRequest,
  AdminUserUpdateResponse,
  AdminUserPasswordResetRequest,
  AdminUserPasswordResetResponse,
} from './services';

// ─── Share Links ──────────────────────────────────────────────────────────────
export {
  shareLinkSchema,
  shareLinkCreateRequestSchema,
  shareLinkUpdateRequestSchema,
  shareLinkListResponseSchema,
  shareLinkCreateResponseSchema,
  shareLinkUpdateResponseSchema,
  publicFileAccessResponseSchema,
  publicFileLockedResponseSchema,
} from './shareLinks';
export type {
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
  ShareLinkListResponse,
  ShareLinkCreateResponse,
  ShareLinkUpdateResponse,
  PublicFileAccessResponse,
  PublicFileLockedResponse,
} from './shareLinks';

// ─── HTTP Client ─────────────────────────────────────────────────────────────
export {
  UnisourceClient,
  UnisourceError,
  UnisourceNetworkError,
  getPublicFileInfo,
  unlockPublicFile,
} from './client';
export type { UnisourceClientConfig } from './client';
