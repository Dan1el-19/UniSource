import { z } from 'zod';
import { nonEmptyString, FILES_MAX_LIMIT } from '../primitives';
import { folderSchema } from '../folders';

// ─── File Records V2 ─────────────────────────────────────────────────────────

export const fileRecordsListV2QuerySchema = z.object({
  folder_id: nonEmptyString.nullable().optional().transform(v => v === 'null' ? null : v),
  is_trashed: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().optional(),
  mime_type: z.string().optional(),
  sort_by: z.enum(['created_at', 'name', 'size']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  cursor: nonEmptyString.optional(),
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
});
export type FileRecordsListV2Query = z.infer<typeof fileRecordsListV2QuerySchema>;

// Bulk Operations for Files
export const bulkFileIdsSchema = z.object({
  ids: z.array(nonEmptyString).min(1).max(100),
});
export type BulkFileIds = z.infer<typeof bulkFileIdsSchema>;

export const bulkFileMoveRequestSchema = z.object({
  ids: z.array(nonEmptyString).min(1).max(100),
  folder_id: nonEmptyString.nullable().optional(),
});
export type BulkFileMoveRequest = z.infer<typeof bulkFileMoveRequestSchema>;

export const bulkOperationResponseSchema = z.object({
  success: z.boolean(),
  processed_count: z.number().int().nonnegative(),
  failed_ids: z.array(nonEmptyString).optional(),
});
export type BulkOperationResponse = z.infer<typeof bulkOperationResponseSchema>;


// ─── Folders V2 ──────────────────────────────────────────────────────────────

export const folderListV2QuerySchema = z.object({
  parent_id: nonEmptyString.nullable().optional().transform(v => v === 'null' ? null : v),
  is_trashed: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().optional(),
  sort_by: z.enum(['created_at', 'name']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  cursor: nonEmptyString.optional(),
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
});
export type FolderListV2Query = z.infer<typeof folderListV2QuerySchema>;

// Bulk Operations for Folders
export const bulkFolderIdsSchema = z.object({
  ids: z.array(nonEmptyString).min(1).max(100),
});
export type BulkFolderIds = z.infer<typeof bulkFolderIdsSchema>;

export const bulkFolderMoveRequestSchema = z.object({
  ids: z.array(nonEmptyString).min(1).max(100),
  parent_id: nonEmptyString.nullable().optional(),
});
export type BulkFolderMoveRequest = z.infer<typeof bulkFolderMoveRequestSchema>;


// Breadcrumbs
export const folderBreadcrumbsResponseSchema = z.object({
  breadcrumbs: z.array(folderSchema),
});
export type FolderBreadcrumbsResponse = z.infer<typeof folderBreadcrumbsResponseSchema>;
