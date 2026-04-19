import { z } from 'zod';

export const FILES_DEFAULT_LIMIT = 25;
export const FILES_MAX_LIMIT = 100;

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.number().int().positive();

export const uploadDestinationSchema = z.enum(['r2', 'appwrite']);
export type UploadDestination = z.infer<typeof uploadDestinationSchema>;

export const uploadStatusSchema = z.enum(['pending', 'completed', 'failed']);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

export const apiErrorSchema = z.object({
  error: nonEmptyStringSchema,
  message: nonEmptyStringSchema,
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const uploadR2InitRequestSchema = z.object({
  filename: nonEmptyStringSchema,
  size: positiveIntegerSchema,
  mime_type: nonEmptyStringSchema,
  bucket: nonEmptyStringSchema.optional(),
});
export type UploadR2InitRequest = z.infer<typeof uploadR2InitRequestSchema>;

export const uploadR2InitResponseSchema = z.object({
  upload_id: nonEmptyStringSchema,
  destination: z.literal('r2'),
  presigned_url: z.string().url(),
  storage_key: nonEmptyStringSchema,
  bucket: nonEmptyStringSchema,
  expires_at: positiveIntegerSchema,
});
export type UploadR2InitResponse = z.infer<typeof uploadR2InitResponseSchema>;

export const uploadAppwriteInitRequestSchema = z.object({
  filename: nonEmptyStringSchema,
  size: positiveIntegerSchema,
  mime_type: nonEmptyStringSchema,
});
export type UploadAppwriteInitRequest = z.infer<typeof uploadAppwriteInitRequestSchema>;

export const uploadAppwriteInitResponseSchema = z.object({
  upload_id: nonEmptyStringSchema,
  destination: z.literal('appwrite'),
  appwrite_endpoint: z.string().url(),
  appwrite_project_id: nonEmptyStringSchema,
  appwrite_bucket_id: nonEmptyStringSchema,
  file_id: nonEmptyStringSchema,
  expires_at: positiveIntegerSchema,
});
export type UploadAppwriteInitResponse = z.infer<typeof uploadAppwriteInitResponseSchema>;

export const uploadLifecycleRequestSchema = z.object({
  upload_id: nonEmptyStringSchema,
});
export type UploadLifecycleRequest = z.infer<typeof uploadLifecycleRequestSchema>;

export const uploadCompleteResponseSchema = z.object({
  success: z.literal(true),
  upload_id: nonEmptyStringSchema,
  status: z.literal('completed'),
});
export type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;

export const uploadFailResponseSchema = z.object({
  success: z.literal(true),
  upload_id: nonEmptyStringSchema,
  status: z.literal('failed'),
});
export type UploadFailResponse = z.infer<typeof uploadFailResponseSchema>;

export const fileRecordSchema = z.object({
  id: nonEmptyStringSchema,
  filename: nonEmptyStringSchema,
  size: positiveIntegerSchema,
  mime_type: nonEmptyStringSchema,
  destination: uploadDestinationSchema,
  storage_key: nonEmptyStringSchema,
  bucket: nonEmptyStringSchema,
  status: uploadStatusSchema,
  expires_at: positiveIntegerSchema,
  created_at: positiveIntegerSchema,
  updated_at: positiveIntegerSchema,
});
export type FileRecord = z.infer<typeof fileRecordSchema>;

export const filesListQuerySchema = z.object({
  limit: z.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
  cursor: nonEmptyStringSchema.optional(),
  destination: uploadDestinationSchema.optional(),
  status: uploadStatusSchema.optional(),
});
export type FilesListQuery = z.infer<typeof filesListQuerySchema>;

export const filesListResponseSchema = z.object({
  items: z.array(fileRecordSchema),
  next_cursor: z.string().nullable(),
  limit: z.number().int().min(1).max(FILES_MAX_LIMIT),
});
export type FilesListResponse = z.infer<typeof filesListResponseSchema>;

export const fileDetailsResponseSchema = z.object({
  file: fileRecordSchema,
});
export type FileDetailsResponse = z.infer<typeof fileDetailsResponseSchema>;

export const fileDownloadUrlResponseSchema = z.object({
  upload_id: nonEmptyStringSchema,
  destination: uploadDestinationSchema,
  download_url: z.string().url(),
  expires_at: positiveIntegerSchema,
});
export type FileDownloadUrlResponse = z.infer<typeof fileDownloadUrlResponseSchema>;

export const fileDeleteResponseSchema = z.object({
  success: z.literal(true),
  upload_id: nonEmptyStringSchema,
  destination: uploadDestinationSchema,
  storage_not_found: z.boolean(),
});
export type FileDeleteResponse = z.infer<typeof fileDeleteResponseSchema>;

// Folders and per-user file records (E2E architecture)
export * from './folders';
export * from './fileRecords';
