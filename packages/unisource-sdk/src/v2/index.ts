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
  V2UploadR2InitRequest,
  V2UploadR2InitResponse,
  V2UploadAppwriteInitRequest,
  V2UploadAppwriteInitResponse,
  V2UploadCompleteRequest,
  V2UploadLifecycleResponse,
  V2MultipartCreateRequest,
  V2MultipartCreateResponse,
  V2MultipartSignPartQuery,
  V2MultipartSignPartResponse,
  V2MultipartPart,
  V2MultipartListPartsResponse,
  V2MultipartCompleteRequest,
  V2MultipartCompleteResponse,
  V2MultipartAbortRequest,
  V2MultipartAbortResponse,
} from './upload-schemas'
