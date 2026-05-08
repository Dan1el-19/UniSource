import { z } from 'zod';
import { FILES_MAX_LIMIT, nonEmptyString } from './primitives';
import { fileRecordSchema } from './fileRecords';

// ─── List ──────────────────────────────────────────────────────────────────────

export const mainStorageListQuerySchema = z.object({
  limit: z.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
  cursor: nonEmptyString.optional(),
});
export type MainStorageListQuery = z.infer<typeof mainStorageListQuerySchema>;

export const mainStorageFileSchema = fileRecordSchema;
export type MainStorageFile = z.infer<typeof mainStorageFileSchema>;

export const mainStorageListResponseSchema = z.object({
  items: z.array(mainStorageFileSchema),
  next_cursor: z.string().nullable(),
});
export type MainStorageListResponse = z.infer<typeof mainStorageListResponseSchema>;

export const mainStorageDetailResponseSchema = mainStorageFileSchema;
export type MainStorageDetailResponse = z.infer<typeof mainStorageDetailResponseSchema>;

// ─── Rename ────────────────────────────────────────────────────────────────────

export const mainStorageRenameRequestSchema = z.object({
  filename: nonEmptyString.max(255),
});
export type MainStorageRenameRequest = z.infer<typeof mainStorageRenameRequestSchema>;

export const mainStorageRenameResponseSchema = z.object({
  file: mainStorageFileSchema,
});
export type MainStorageRenameResponse = z.infer<typeof mainStorageRenameResponseSchema>;

// ─── Delete ────────────────────────────────────────────────────────────────────

export const mainStorageDeleteResponseSchema = z.object({
  success: z.boolean(),
  file_id: nonEmptyString,
});
export type MainStorageDeleteResponse = z.infer<typeof mainStorageDeleteResponseSchema>;

// ─── Restore ───────────────────────────────────────────────────────────────────

export const mainStorageRestoreResponseSchema = z.object({
  success: z.boolean(),
  file_id: nonEmptyString,
});
export type MainStorageRestoreResponse = z.infer<typeof mainStorageRestoreResponseSchema>;
