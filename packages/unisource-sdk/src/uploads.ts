import { z } from 'zod';
import { nonEmptyString, positiveInt, uploadDestinationSchema, uploadStatusSchema, FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from './primitives';

// ─── Init: R2 ────────────────────────────────────────────────────────────────

export const uploadR2InitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
});
export type UploadR2InitRequest = z.infer<typeof uploadR2InitRequestSchema>;

export const uploadR2InitResponseSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('r2'),
  presigned_url: z.string().url(),
  storage_key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
});
export type UploadR2InitResponse = z.infer<typeof uploadR2InitResponseSchema>;

// ─── Init: Appwrite ───────────────────────────────────────────────────────────

export const uploadAppwriteInitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
});
export type UploadAppwriteInitRequest = z.infer<typeof uploadAppwriteInitRequestSchema>;

export const uploadAppwriteInitResponseSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('appwrite'),
  appwrite_endpoint: z.string().url(),
  appwrite_project_id: nonEmptyString,
  appwrite_bucket_id: nonEmptyString,
  file_id: nonEmptyString,
  expires_at: positiveInt,
});
export type UploadAppwriteInitResponse = z.infer<typeof uploadAppwriteInitResponseSchema>;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export const uploadLifecycleRequestSchema = z.object({
  upload_id: nonEmptyString,
  is_main_storage: z.boolean().optional().default(false),
});
export type UploadLifecycleRequest = z.infer<typeof uploadLifecycleRequestSchema>;

export const uploadCompleteResponseSchema = z.object({
  success: z.literal(true),
  upload_id: nonEmptyString,
  status: z.literal('completed'),
});
export type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;

export const uploadFailResponseSchema = z.object({
  success: z.literal(true),
  upload_id: nonEmptyString,
  status: z.literal('failed'),
});
export type UploadFailResponse = z.infer<typeof uploadFailResponseSchema>;

// ─── Admin: list uploads ──────────────────────────────────────────────────────

export { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT };

/** Raw upload record — returned by admin `/files` endpoints. */
export const uploadRecordSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  user_id: nonEmptyString.nullable(),
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  destination: uploadDestinationSchema,
  status: uploadStatusSchema,
  expires_at: positiveInt,
  created_at: positiveInt,
  updated_at: positiveInt,
});
export type UploadRecord = z.infer<typeof uploadRecordSchema>;

export const uploadsListResponseSchema = z.object({
  items: z.array(uploadRecordSchema),
  next_cursor: z.string().nullable(),
  limit: positiveInt,
});
export type UploadsListResponse = z.infer<typeof uploadsListResponseSchema>;

export const uploadRecordDetailResponseSchema = z.object({
  upload: uploadRecordSchema,
});
export type UploadRecordDetailResponse = z.infer<typeof uploadRecordDetailResponseSchema>;
