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
export type UploadR2InitRequest = z.input<typeof uploadR2InitRequestSchema>;

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
export type UploadAppwriteInitRequest = z.input<typeof uploadAppwriteInitRequestSchema>;

export const uploadAppwriteInitResponseSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('appwrite'),
  appwrite_endpoint: z.string().url(),
  appwrite_project_id: nonEmptyString,
  appwrite_bucket_id: nonEmptyString,
  file_id: nonEmptyString,
  expires_at: positiveInt,
  /** Appwrite JWT to authenticate the client-side SDK upload. Only present for JWT-authenticated requests. */
  jwt: nonEmptyString.optional(),
});
export type UploadAppwriteInitResponse = z.infer<typeof uploadAppwriteInitResponseSchema>;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export const uploadLifecycleRequestSchema = z.object({
  upload_id: nonEmptyString,
  is_main_storage: z.boolean().optional().default(false),
});
export type UploadLifecycleRequest = z.input<typeof uploadLifecycleRequestSchema>;

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

// ─── Multipart: Create ────────────────────────────────────────────────────────

export const multipartCreateRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
});
export type MultipartCreateRequest = z.input<typeof multipartCreateRequestSchema>;

export const multipartCreateResponseSchema = z.object({
  /** Internal UniSource upload record id. */
  upload_id: nonEmptyString,
  /** S3 (R2) multipart UploadId — required for every sign/complete/abort call. */
  r2_upload_id: nonEmptyString,
  /** R2 object key that the parts are being uploaded to. */
  key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
});
export type MultipartCreateResponse = z.infer<typeof multipartCreateResponseSchema>;

// ─── Multipart: Sign Part ─────────────────────────────────────────────────────

export const multipartSignPartQuerySchema = z.object({
  upload_id: nonEmptyString,
  part_number: z.coerce.number().int().min(1).max(10_000),
});
export type MultipartSignPartQuery = z.input<typeof multipartSignPartQuerySchema>;

export const multipartSignPartResponseSchema = z.object({
  url: z.string().url(),
  expires_at: positiveInt,
});
export type MultipartSignPartResponse = z.infer<typeof multipartSignPartResponseSchema>;

// ─── Multipart: List Parts ────────────────────────────────────────────────────

export const multipartListPartsQuerySchema = z.object({
  upload_id: nonEmptyString,
});
export type MultipartListPartsQuery = z.input<typeof multipartListPartsQuerySchema>;

export const multipartPartSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: nonEmptyString,
  Size: z.number().int().nonnegative(),
});
export type MultipartPart = z.infer<typeof multipartPartSchema>;

export const multipartListPartsResponseSchema = z.object({
  parts: z.array(multipartPartSchema),
});
export type MultipartListPartsResponse = z.infer<typeof multipartListPartsResponseSchema>;

// ─── Multipart: Complete ──────────────────────────────────────────────────────

export const multipartCompleteRequestSchema = z.object({
  upload_id: nonEmptyString,
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().min(1).max(10_000),
        ETag: nonEmptyString,
      })
    )
    .min(1),
});
export type MultipartCompleteRequest = z.input<typeof multipartCompleteRequestSchema>;

export const multipartCompleteResponseSchema = uploadCompleteResponseSchema;
export type MultipartCompleteResponse = z.infer<typeof multipartCompleteResponseSchema>;

// ─── Multipart: Abort ─────────────────────────────────────────────────────────

export const multipartAbortRequestSchema = z.object({
  upload_id: nonEmptyString,
});
export type MultipartAbortRequest = z.input<typeof multipartAbortRequestSchema>;

export const multipartAbortResponseSchema = uploadFailResponseSchema;
export type MultipartAbortResponse = z.infer<typeof multipartAbortResponseSchema>;

// ─── Admin: list uploads ──────────────────────────────────────────────────────

export { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT };

export const uploadTypeSchema = z.enum(['single', 'multipart']);
export type UploadType = z.infer<typeof uploadTypeSchema>;

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
  upload_type: uploadTypeSchema.optional(),
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
