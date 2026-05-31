import { z } from 'zod';
import { nonEmptyString, positiveInt, FILES_MAX_LIMIT } from './primitives';

// ─── Folder record ────────────────────────────────────────────────────────────

export const folderSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  user_id: nonEmptyString,
  parent_id: nonEmptyString.nullable(),
  name: nonEmptyString,
  color_tag: z.string().nullable(),
  is_trashed: z.boolean(),
  trashed_at: positiveInt.nullable(),
  created_at: positiveInt,
  updated_at: positiveInt,
});
export type Folder = z.infer<typeof folderSchema>;

// ─── List ─────────────────────────────────────────────────────────────────────

export const folderListQuerySchema = z
  .object({
    parent_id: nonEmptyString.nullable().optional(),
    trashed: z.boolean().optional(),
    is_trashed: z.boolean().optional(),
    cursor: nonEmptyString.optional(),
    limit: z.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
  })
  .refine(
    (v) => !(v.trashed !== undefined && v.is_trashed !== undefined),
    { message: 'Use either trashed or is_trashed, not both' }
  );
export type FolderListQuery = z.infer<typeof folderListQuerySchema>;

export const folderListResponseSchema = z.object({
  items: z.array(folderSchema),
  next_cursor: z.string().nullable(),
  limit: positiveInt,
});
export type FolderListResponse = z.infer<typeof folderListResponseSchema>;

// ─── Create ───────────────────────────────────────────────────────────────────

export const folderCreateRequestSchema = z.object({
  name: nonEmptyString,
  parent_id: nonEmptyString.optional(),
  color_tag: z.string().optional(),
});
export type FolderCreateRequest = z.infer<typeof folderCreateRequestSchema>;

export const folderCreateResponseSchema = z.object({
  folder: folderSchema,
});
export type FolderCreateResponse = z.infer<typeof folderCreateResponseSchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

export const folderUpdateRequestSchema = z
  .object({
    name: nonEmptyString.optional(),
    color_tag: z.string().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.color_tag !== undefined, {
    message: 'At least one of name or color_tag must be provided',
  });
export type FolderUpdateRequest = z.infer<typeof folderUpdateRequestSchema>;

export const folderUpdateResponseSchema = z.object({
  folder: folderSchema,
});
export type FolderUpdateResponse = z.infer<typeof folderUpdateResponseSchema>;

// ─── Delete ───────────────────────────────────────────────────────────────────

export const folderDeleteResponseSchema = z.object({
  success: z.literal(true),
  id: nonEmptyString,
  permanent: z.boolean(),
  folders_deleted: z.number().int().nonnegative().optional(),
});
export type FolderDeleteResponse = z.infer<typeof folderDeleteResponseSchema>;

// ─── Single folder detail ─────────────────────────────────────────────────────

export const folderDetailResponseSchema = z.object({
  folder: folderSchema,
});
export type FolderDetailResponse = z.infer<typeof folderDetailResponseSchema>;

// ─── Restore ──────────────────────────────────────────────────────────────────

export const folderRestoreResponseSchema = z.object({
  success: z.literal(true),
  id: nonEmptyString,
});
export type FolderRestoreResponse = z.infer<typeof folderRestoreResponseSchema>;
