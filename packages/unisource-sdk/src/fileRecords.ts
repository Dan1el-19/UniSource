import { z } from 'zod';
import {
  nonEmptyString,
  nonNegativeInt,
  positiveInt,
  uploadDestinationSchema,
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
} from './primitives';

// ─── User-facing file record ──────────────────────────────────────────────────

/**
 * A confirmed file record owned by a user.
 * Internal fields (storage_key, bucket) are intentionally excluded from the public API.
 */
export const fileRecordSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  user_id: nonEmptyString,
  folder_id: nonEmptyString.nullable(),
  upload_id: nonEmptyString.nullable(),
  filename: nonEmptyString,
  /** SDK6: zero-byte uploads are valid (e.g. placeholders). */
  size: nonNegativeInt,
  mime_type: nonEmptyString,
  storage_destination: uploadDestinationSchema,
  is_trashed: z.boolean(),
  trashed_at: positiveInt.nullable(),
  created_at: positiveInt,
  updated_at: positiveInt,
});
export type FileRecord = z.infer<typeof fileRecordSchema>;

// ─── List ─────────────────────────────────────────────────────────────────────

export { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT };


export const fileRecordsListQuerySchema = z.object({
  folder_id: nonEmptyString.nullable().optional(),
  is_trashed: z.boolean().optional(),
  cursor: nonEmptyString.optional(),
  limit: z.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
});
export type FileRecordsListQuery = z.infer<typeof fileRecordsListQuerySchema>;

export const fileRecordsListResponseSchema = z.object({
  items: z.array(fileRecordSchema),
  next_cursor: z.string().nullable(),
  limit: positiveInt,
});
export type FileRecordsListResponse = z.infer<typeof fileRecordsListResponseSchema>;

// ─── Single file detail ───────────────────────────────────────────────────────

export const fileRecordDetailResponseSchema = z.object({
  file: fileRecordSchema,
});
export type FileRecordDetailResponse = z.infer<typeof fileRecordDetailResponseSchema>;

// ─── Move ────────────────────────────────────────────────────────────────────

export const fileMoveRequestSchema = z.object({
  /** null = move to root, undefined = keep unchanged */
  folder_id: nonEmptyString.nullable().optional(),
});
export type FileMoveRequest = z.infer<typeof fileMoveRequestSchema>;

// ─── Download URL ─────────────────────────────────────────────────────────────

export const fileDownloadUrlResponseSchema = z.object({
  upload_id: nonEmptyString,
  destination: uploadDestinationSchema,
  download_url: z.string().url(),
  expires_at: positiveInt,
});
export type FileDownloadUrlResponse = z.infer<typeof fileDownloadUrlResponseSchema>;

// ─── Delete ───────────────────────────────────────────────────────────────────

export const fileDeleteResponseSchema = z.object({
  success: z.literal(true),
  id: nonEmptyString,
  permanent: z.boolean(),
});
export type FileDeleteResponse = z.infer<typeof fileDeleteResponseSchema>;

// ─── Restore ──────────────────────────────────────────────────────────────────

export const fileRestoreResponseSchema = z.object({
  success: z.literal(true),
  id: nonEmptyString,
});
export type FileRestoreResponse = z.infer<typeof fileRestoreResponseSchema>;

// ─── Update (rename) ──────────────────────────────────────────────────────────

/** SDK4: filename hard-capped to 255 to match backend Zod validation. */
export const fileUpdateRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
});
export type FileUpdateRequest = z.infer<typeof fileUpdateRequestSchema>;

export const fileUpdateResponseSchema = z.object({
  file: fileRecordSchema,
});
export type FileUpdateResponse = z.infer<typeof fileUpdateResponseSchema>;
