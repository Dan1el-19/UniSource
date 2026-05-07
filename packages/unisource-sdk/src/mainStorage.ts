import { z } from 'zod';
import { nonEmptyString } from './primitives';
import { fileRecordSchema } from './fileRecords';

// ─── List ──────────────────────────────────────────────────────────────────────

export const mainStorageListQuerySchema = z.object({
  limit: z.number().int().positive().optional(),
  cursor: nonEmptyString.optional(),
});
export type MainStorageListQuery = z.infer<typeof mainStorageListQuerySchema>;

export const mainStorageListResponseSchema = z.object({
  items: z.array(fileRecordSchema),
  next_cursor: z.string().nullable(),
});
export type MainStorageListResponse = z.infer<typeof mainStorageListResponseSchema>;

// ─── Rename ────────────────────────────────────────────────────────────────────

export const mainStorageRenameRequestSchema = z.object({
  filename: nonEmptyString,
});
export type MainStorageRenameRequest = z.infer<typeof mainStorageRenameRequestSchema>;

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
