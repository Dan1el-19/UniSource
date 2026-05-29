// @beta — see docs/api-v2-architecture.md
export * from './legacy-draft'

// New v2 beta API
export * from './types'
export * from './files'
export * from './folders'
export * from './my-files-schemas'
export * from './schemas'
export * from './errors'
export { V2_ERROR_CODES, isV2ErrorCode } from './error-codes'
export type { V2ErrorCode } from './error-codes'
export { v2BulkResponseSchema, v2BulkFailureSchema } from './bulk-schemas'
export type { V2BulkResponse, V2BulkFailure } from './bulk-schemas'
export type { V2FoldersBulkRequest } from './resources/folders'
export type { V2FilesBulkRequest } from './resources/files'
export {
  publicShareLinkResponseSchema,
  publicShareLinkUnlockedResponseSchema,
  publicShareLinkLockedResponseSchema,
  publicUnlockResponseSchema,
  unlockShareLinkRequestSchema,
} from './public-schemas'
export type {
  PublicShareLinkResponse,
  PublicShareLinkUnlockedResponse,
  PublicShareLinkLockedResponse,
  PublicUnlockResponse,
  UnlockShareLinkRequest,
} from './public-schemas'
export { UnisourceV2Client } from './client'
export type { UnisourceV2ClientConfig } from './client'

// Admin (V2 namespace)
export {
  adminServiceResponseSchema,
  adminServiceUpdateRequestSchema,
  adminServiceSettingsUpdateRequestSchema,
  adminServiceUsageResponseSchema,
  adminAuditLogQuerySchema,
  adminAuditLogListResponseSchema,
  adminUsersListQuerySchema,
  adminUsersListResponseSchema,
  adminUserResponseSchema,
  adminUserUpdateRequestSchema,
  adminUserPasswordResetRequestSchema,
  adminPasswordResetResponseSchema,
  adminUserRoleUpdateRequestSchema,
  adminUserStorageLimitUpdateRequestSchema,
  adminQuotaReconcileRequestSchema,
  adminQuotaReconcileResponseSchema,
} from './admin-schemas'
export type {
  AdminServiceResponse,
  AdminServiceUpdateRequest,
  AdminServiceSettingsUpdateRequest,
  AdminServiceUsageResponse,
  AdminAuditLogQuery,
  AdminAuditLogListResponse,
  AdminUsersListQuery,
  AdminUsersListResponse,
  AdminUserResponse,
  AdminUserUpdateRequest,
  AdminUserPasswordResetRequest,
  AdminPasswordResetResponse,
  AdminUserRoleUpdateRequest,
  AdminUserStorageLimitUpdateRequest,
  AdminQuotaReconcileRequest,
  AdminQuotaReconcileResponse,
} from './admin-schemas'

// Upload (V2 namespace)
export {
  v2UploadR2InitRequestSchema,
  v2UploadR2InitResponseSchema,
  v2UploadAppwriteInitRequestSchema,
  v2UploadAppwriteInitResponseSchema,
  v2UploadCompleteRequestSchema,
  v2UploadLifecycleResponseSchema,
  v2MultipartCreateRequestSchema,
  v2MultipartCreateResponseSchema,
  v2MultipartSignPartQuerySchema,
  v2MultipartSignPartResponseSchema,
  v2MultipartListPartsResponseSchema,
  v2MultipartCompleteRequestSchema,
  v2MultipartCompleteResponseSchema,
  v2MultipartAbortRequestSchema,
  v2MultipartAbortResponseSchema,
} from './upload-schemas'
export type {
  V2MultipartCompleteResponse,
  V2MultipartAbortRequest,
  V2MultipartAbortResponse,
} from './upload-schemas'

// Releases (V2 namespace)
export {
  v2ReleaseSchema,
  v2ReleaseListQuerySchema,
  v2ReleaseListResponseSchema,
  v2ReleaseResourceResponseSchema,
  v2ReleaseUploadInitRequestSchema,
  v2ReleaseUploadInitResponseSchema,
  v2ReleaseUploadCompleteRequestSchema,
  v2ReleaseLifecycleResponseSchema,
  v2ReleaseMultipartCreateRequestSchema,
  v2ReleaseMultipartCreateResponseSchema,
  v2ReleaseMultipartSignPartQuerySchema,
  v2ReleaseMultipartSignPartResponseSchema,
  v2ReleaseMultipartListPartsResponseSchema,
  v2ReleaseMultipartCompleteRequestSchema,
  v2ReleaseMultipartAbortRequestSchema,
  v2ReleaseUpdateRequestSchema,
  v2ReleaseDeleteResponseSchema,
  v2ReleaseSyncManifestSchema,
  v2ReleaseSyncRequestSchema,
  v2ReleaseSyncResponseSchema,
} from './release-schemas'
export type {
  V2Release,
  V2ReleaseListQuery,
  V2ReleaseListResponse,
  V2ReleaseResourceResponse,
  V2ReleaseUploadInitRequest,
  V2ReleaseUploadInitResponse,
  V2ReleaseUploadCompleteRequest,
  V2ReleaseLifecycleResponse,
  V2ReleaseMultipartCreateRequest,
  V2ReleaseMultipartCreateResponse,
  V2ReleaseMultipartSignPartResponse,
  V2ReleaseMultipartPart,
  V2ReleaseMultipartListPartsResponse,
  V2ReleaseMultipartCompleteRequest,
  V2ReleaseUpdateRequest,
  V2ReleaseDeleteResponse,
  V2ReleaseSyncManifest,
  V2ReleaseSyncRequest,
  V2ReleaseSyncResponse,
} from './release-schemas'
