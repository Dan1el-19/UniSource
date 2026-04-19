import { z } from 'zod';
import { nonEmptyString, positiveInt, unixTimestamp } from './primitives';

// ─── Service record ───────────────────────────────────────────────────────────

/** Public service info returned to admins. Never exposes secrets. */
export const serviceSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  max_storage_bytes: positiveInt,
  current_used_bytes: z.number().int().nonnegative(),
  max_file_size_bytes: positiveInt,
  created_at: unixTimestamp,
});
export type Service = z.infer<typeof serviceSchema>;

export const serviceDetailResponseSchema = z.object({
  service: serviceSchema,
});
export type ServiceDetailResponse = z.infer<typeof serviceDetailResponseSchema>;

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
