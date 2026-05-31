import { z } from 'zod'
import { recommendedUploadDestinationSchema } from '../v1/primitives'
import {
  adminUserSchema,
  auditEventSchema,
  serviceSchema,
} from '../v1/services'

// ─── Service ────────────────────────────────────────────────────────────────

/** Response wrapper used by getService / updateService / updateServiceSettings. */
export const adminServiceResponseSchema = z.object({
  service: serviceSchema,
})
export type AdminServiceResponse = z.infer<typeof adminServiceResponseSchema>

export const adminServiceUpdateRequestSchema = z.object({
  max_storage_bytes: z.number().int().positive(),
  max_file_size_bytes: z.number().int().positive(),
})
export type AdminServiceUpdateRequest = z.infer<typeof adminServiceUpdateRequestSchema>

export const adminServiceSettingsUpdateRequestSchema = z.object({
  recommended_upload_destination: recommendedUploadDestinationSchema,
})
export type AdminServiceSettingsUpdateRequest = z.infer<
  typeof adminServiceSettingsUpdateRequestSchema
>

// ─── Service usage ──────────────────────────────────────────────────────────

export const adminServiceUsageResponseSchema = z.object({
  service_id: z.string().min(1),
  max_storage_bytes: z.number().int().positive(),
  current_used_bytes: z.number().int().nonnegative(),
  used_percent: z.number().min(0).max(100),
})
export type AdminServiceUsageResponse = z.infer<typeof adminServiceUsageResponseSchema>

// ─── Audit log ──────────────────────────────────────────────────────────────

export const adminAuditLogQuerySchema = z.object({
  user_id: z.string().min(1).optional(),
  action: z
    .enum(['upload_completed', 'file_deleted', 'folder_deleted', 'quota_exceeded', 'share_link_accessed'])
    .optional(),
  resource_type: z.enum(['file', 'folder', 'service']).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>

export const adminAuditLogListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  next_cursor: z.string().nullable(),
  limit: z.number().int().positive(),
})
export type AdminAuditLogListResponse = z.infer<typeof adminAuditLogListResponseSchema>

// ─── Users ──────────────────────────────────────────────────────────────────

export const adminUsersListQuerySchema = z.object({
  search: z.string().trim().max(256).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})
export type AdminUsersListQuery = z.infer<typeof adminUsersListQuerySchema>

export const adminUsersListResponseSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
})
export type AdminUsersListResponse = z.infer<typeof adminUsersListResponseSchema>

/** Response wrapper used by updateUser / updateUserRole / updateUserStorageLimit. */
export const adminUserResponseSchema = z.object({
  user: adminUserSchema,
})
export type AdminUserResponse = z.infer<typeof adminUserResponseSchema>

export const adminUserUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().email().optional(),
  status: z.boolean().optional(),
  labels: z.array(z.string().trim().min(1)).max(32).optional(),
  role: z.enum(['user', 'plus', 'admin']).optional(),
  max_storage_bytes: z.number().int().positive().nullable().optional(),
})
export type AdminUserUpdateRequest = z.infer<typeof adminUserUpdateRequestSchema>

export const adminUserPasswordResetRequestSchema = z.object({
  password: z.string().min(8).max(256),
})
export type AdminUserPasswordResetRequest = z.infer<typeof adminUserPasswordResetRequestSchema>

export const adminPasswordResetResponseSchema = z.object({
  success: z.literal(true),
  user_id: z.string().min(1),
})
export type AdminPasswordResetResponse = z.infer<typeof adminPasswordResetResponseSchema>

export const adminUserRoleUpdateRequestSchema = z.object({
  role: z.enum(['user', 'plus', 'admin']),
})
export type AdminUserRoleUpdateRequest = z.infer<typeof adminUserRoleUpdateRequestSchema>

export const adminUserStorageLimitUpdateRequestSchema = z.object({
  limit_bytes: z.number().int().positive().nullable(),
})
export type AdminUserStorageLimitUpdateRequest = z.infer<
  typeof adminUserStorageLimitUpdateRequestSchema
>

// ─── Quota ──────────────────────────────────────────────────────────────────

export const adminQuotaReconcileRequestSchema = z.object({
  dryRun: z.boolean().optional(),
})
export type AdminQuotaReconcileRequest = z.infer<typeof adminQuotaReconcileRequestSchema>

export const adminQuotaReconcileResponseSchema = z.object({
  service_drift_bytes: z.number().int(),
  service_corrected: z.boolean(),
  main_drift_bytes: z.number().int(),
  main_corrected: z.boolean(),
  users_fixed: z.number().int().nonnegative(),
  dry_run: z.boolean(),
})
export type AdminQuotaReconcileResponse = z.infer<typeof adminQuotaReconcileResponseSchema>
