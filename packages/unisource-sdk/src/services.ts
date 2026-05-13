import { z } from 'zod';
import { nonEmptyString, positiveInt, recommendedUploadDestinationSchema, unixTimestamp } from './primitives';

// ─── Service record ───────────────────────────────────────────────────────────

/** Public service info returned to admins. Never exposes secrets. */
export const serviceSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  max_storage_bytes: positiveInt,
  current_used_bytes: z.number().int().nonnegative(),
  max_file_size_bytes: positiveInt,
  recommended_upload_destination: recommendedUploadDestinationSchema.optional(),
  created_at: unixTimestamp,
});
export type Service = z.infer<typeof serviceSchema>;

export const serviceDetailResponseSchema = z.object({
  service: serviceSchema,
});
export type ServiceDetailResponse = z.infer<typeof serviceDetailResponseSchema>;

export const adminServiceUpdateRequestSchema = z
  .object({
    max_storage_bytes: positiveInt.optional(),
    max_file_size_bytes: positiveInt.optional(),
  })
  .refine(
    (v) => v.max_storage_bytes !== undefined || v.max_file_size_bytes !== undefined,
    { message: 'At least one of max_storage_bytes or max_file_size_bytes must be provided' }
  );
export type AdminServiceUpdateRequest = z.infer<typeof adminServiceUpdateRequestSchema>;

export const adminServiceUpdateResponseSchema = serviceDetailResponseSchema;
export type AdminServiceUpdateResponse = z.infer<typeof adminServiceUpdateResponseSchema>;

// ─── Admin: Service Settings (split from limits) ──────────────────────────────

/**
 * Separate settings endpoint driven by the Split-Button upload UI. Clients
 * can flip the recommended default upload destination per service without
 * disturbing quota-related fields.
 */
export const adminServiceSettingsRequestSchema = z
  .object({
    recommended_upload_destination: recommendedUploadDestinationSchema.optional(),
  })
  .refine((v) => v.recommended_upload_destination !== undefined, {
    message: 'At least one setting must be provided',
  });
export type AdminServiceSettingsRequest = z.infer<typeof adminServiceSettingsRequestSchema>;

export const adminServiceSettingsResponseSchema = serviceDetailResponseSchema;
export type AdminServiceSettingsResponse = z.infer<typeof adminServiceSettingsResponseSchema>;

// ─── Service usage summary ────────────────────────────────────────────────────

export const serviceUsageResponseSchema = z.object({
  service_id: nonEmptyString,
  max_storage_bytes: positiveInt,
  current_used_bytes: z.number().int().nonnegative(),
  used_percent: z.number().min(0).max(100),
});
export type ServiceUsageResponse = z.infer<typeof serviceUsageResponseSchema>;

// ─── Audit log event ──────────────────────────────────────────────────────────

export const auditEventActionSchema = z.enum([
  'upload_completed',
  'file_deleted',
  'folder_deleted',
  'quota_exceeded',
  'share_link_accessed',
  'quota_reconciled',
]);
export type AuditEventAction = z.infer<typeof auditEventActionSchema>;

export const auditEventSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  user_id: nonEmptyString,
  action: auditEventActionSchema,
  resource_type: z.enum(['file', 'folder', 'service']),
  resource_id: nonEmptyString,
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ip_address: z.string().nullable(),
  actor_id: z.string().nullable().optional(),
  target_user_id: z.string().nullable().optional(),
  created_at: unixTimestamp,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditLogListQuerySchema = z.object({
  user_id: nonEmptyString.optional(),
  action: auditEventActionSchema.optional(),
  resource_type: z.enum(['file', 'folder', 'service']).optional(),
  cursor: nonEmptyString.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;

export const auditLogListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  next_cursor: z.string().nullable(),
  limit: positiveInt,
});
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

export const adminUserSchema = z.object({
  id: nonEmptyString,
  name: z.string(),
  email: z.string().email(),
  status: z.boolean(),
  labels: z.array(z.string()),
  role: nonEmptyString,
  has_service_access: z.boolean(),
  max_storage_bytes: positiveInt.nullable(),
  effective_max_storage_bytes: positiveInt,
  current_used_bytes: z.number().int().nonnegative(),
  registration: unixTimestamp,
  email_verification: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUserListResponseSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: positiveInt,
});
export type AdminUserListResponse = z.infer<typeof adminUserListResponseSchema>;

export const adminUserUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().email().optional(),
  status: z.boolean().optional(),
  labels: z.array(z.string().trim().min(1)).max(32).optional(),
  role: z.enum(['user', 'plus', 'admin']).optional(),
  max_storage_bytes: positiveInt.nullable().optional(),
});
export type AdminUserUpdateRequest = z.infer<typeof adminUserUpdateRequestSchema>;

export const adminUserUpdateResponseSchema = z.object({
  user: adminUserSchema,
});
export type AdminUserUpdateResponse = z.infer<typeof adminUserUpdateResponseSchema>;

export const adminUserPasswordResetRequestSchema = z.object({
  password: z.string().min(8).max(256),
});
export type AdminUserPasswordResetRequest = z.infer<typeof adminUserPasswordResetRequestSchema>;

export const adminUserPasswordResetResponseSchema = z.object({
  success: z.literal(true),
  user_id: nonEmptyString,
});
export type AdminUserPasswordResetResponse = z.infer<typeof adminUserPasswordResetResponseSchema>;

// ─── Separate role/storage-limit update endpoints ─────────────────────────────

export const adminUserRoleUpdateRequestSchema = z.object({
  role: z.enum(['user', 'plus', 'admin']),
});
export type AdminUserRoleUpdateRequest = z.infer<typeof adminUserRoleUpdateRequestSchema>;

export const adminUserStorageLimitUpdateRequestSchema = z.object({
  limit_bytes: positiveInt.nullable(),
});
export type AdminUserStorageLimitUpdateRequest = z.infer<typeof adminUserStorageLimitUpdateRequestSchema>;
