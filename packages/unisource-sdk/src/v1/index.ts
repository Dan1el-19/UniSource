// ─── Primitives ───────────────────────────────────────────────────────────────
export {
  nonEmptyString,
  positiveInt,
  nonNegativeInt,
  unixTimestamp,
  uploadDestinationSchema,
  recommendedUploadDestinationSchema,
  uploadStatusSchema,
  apiErrorSchema,
  FILES_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  FILES_MAX_LIMIT,
} from './primitives';
export type {
  UploadDestination,
  RecommendedUploadDestination,
  UploadStatus,
  ApiError,
} from './primitives';


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
  uploadTypeSchema,
  multipartCreateRequestSchema,
  multipartCreateResponseSchema,
  multipartSignPartQuerySchema,
  multipartSignPartResponseSchema,
  multipartListPartsQuerySchema,
  multipartListPartsResponseSchema,
  multipartPartSchema,
  multipartCompleteRequestSchema,
  multipartCompleteResponseSchema,
  multipartAbortRequestSchema,
  multipartAbortResponseSchema,
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
  UploadType,
  MultipartCreateRequest,
  MultipartCreateResponse,
  MultipartSignPartQuery,
  MultipartSignPartResponse,
  MultipartListPartsQuery,
  MultipartListPartsResponse,
  MultipartPart,
  MultipartCompleteRequest,
  MultipartCompleteResponse,
  MultipartAbortRequest,
  MultipartAbortResponse,
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
  adminServiceSettingsRequestSchema,
  adminServiceSettingsResponseSchema,
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
  adminUserRoleUpdateRequestSchema,
  adminUserStorageLimitUpdateRequestSchema,
} from './services';
export type {
  Service,
  ServiceDetailResponse,
  AdminServiceUpdateRequest,
  AdminServiceUpdateResponse,
  AdminServiceSettingsRequest,
  AdminServiceSettingsResponse,
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
  AdminUserRoleUpdateRequest,
  AdminUserStorageLimitUpdateRequest,
} from './services';

// ─── Main Storage ─────────────────────────────────────────────────────────────
export * from './mainStorage';

// ─── Releases ───────────────────────────────────────────────────────────────
export {
  releaseDTOSchema,
  releaseUploadInitRequestSchema,
  releaseUploadInitResponseSchema,
  releaseUploadCompleteRequestSchema,
  releaseUploadCompleteResponseSchema,
  releaseUploadFailResponseSchema,
  releasesListQuerySchema,
  releasesListResponseSchema,
  releaseUpdateRequestSchema,
  releaseDeleteResponseSchema,
  releaseSyncManifestSchema,
  releaseSyncRequestSchema,
  releaseSyncResultSchema,
  releaseSyncResponseSchema,
  releaseMultipartCreateRequestSchema,
  releaseMultipartCreateResponseSchema,
  releaseMultipartSignPartQuerySchema,
  releaseMultipartSignPartResponseSchema,
  releaseMultipartListPartsQuerySchema,
  releaseMultipartListPartsResponseSchema,
  releaseMultipartPartSchema,
  releaseMultipartCompleteRequestSchema,
  releaseMultipartCompleteResponseSchema,
  releaseMultipartAbortRequestSchema,
  releaseMultipartAbortResponseSchema,
  appReleaseLatestQuerySchema,
  appReleaseLatestResponseSchema,
} from './releases';
export type {
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
  ReleaseSyncManifest,
  ReleaseSyncRequest,
  ReleaseSyncResult,
  ReleaseSyncResponse,
  ReleaseMultipartCreateRequest,
  ReleaseMultipartCreateResponse,
  ReleaseMultipartSignPartQuery,
  ReleaseMultipartSignPartResponse,
  ReleaseMultipartListPartsQuery,
  ReleaseMultipartListPartsResponse,
  ReleaseMultipartPart,
  ReleaseMultipartCompleteRequest,
  ReleaseMultipartCompleteResponse,
  ReleaseMultipartAbortRequest,
  ReleaseMultipartAbortResponse,
  AppReleaseLatestQuery,
  AppReleaseLatestResponse,
} from './releases';

// ─── Share Links ─────────────────────────────────────────────────────────────
export {
  shareLinkSchema,
  shareLinkCreateRequestSchema,
  shareLinkUpdateRequestSchema,
  shareLinkListResponseSchema,
  shareLinkCreateResponseSchema,
  shareLinkUpdateResponseSchema,
  shareLinkDeleteResponseSchema,
  shareLinkDetailResponseSchema,
  sharesCreateRequestSchema,
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
  ShareLinkDeleteResponse,
  ShareLinkDetailResponse,
  SharesCreateRequest,
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

// ─── Legacy V2 Draft API ─────────────────────────────────────────────────────
// Preserved at the stable root for backwards compatibility. New consumers
// should use the dedicated @unisource/sdk/v2 subpath.
export {
  fileRecordsListV2QuerySchema,
  bulkFileIdsSchema,
  bulkFileMoveRequestSchema,
  bulkOperationResponseSchema,
  folderListV2QuerySchema,
  bulkFolderIdsSchema,
  bulkFolderMoveRequestSchema,
  folderBreadcrumbsResponseSchema,
} from '../v2/legacy-draft';
export type {
  FileRecordsListV2Query,
  BulkFileIds,
  BulkFileMoveRequest,
  BulkOperationResponse,
  FolderListV2Query,
  BulkFolderIds,
  BulkFolderMoveRequest,
  FolderBreadcrumbsResponse,
} from '../v2/legacy-draft';
