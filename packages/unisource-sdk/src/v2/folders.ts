import { z } from 'zod'
import { LIST_MAX_LIMIT } from '../primitives'
import { v2ListResponseSchema, v2ResourceResponseSchema } from './schemas'

// ─── V2 Folder ──────────────────────────────────────────────────────────────

export const v2FolderSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  user_id: z.string(),
  parent_id: z.string().nullable(),
  name: z.string(),
  color_tag: z.string().nullable(),
  is_trashed: z.boolean(),
  trashed_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export type V2Folder = z.infer<typeof v2FolderSchema>

// ─── Query ──────────────────────────────────────────────────────────────────

export const v2FolderListQuerySchema = z.object({
  parent_id: z.string().nullable().optional(),
  search: z.string().max(100).optional(),
  trash: z.enum(['active', 'trashed', 'all']).optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'name']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(LIST_MAX_LIMIT).optional(),
})

export type V2FolderListQuery = z.infer<typeof v2FolderListQuerySchema>

// ─── Response ───────────────────────────────────────────────────────────────

export const v2FolderListResponseSchema = v2ListResponseSchema(v2FolderSchema)
export type V2FolderListResponse = z.infer<typeof v2FolderListResponseSchema>

export const v2FolderBreadcrumbsResponseSchema = z.object({
  breadcrumbs: z.array(v2FolderSchema),
})
export type V2FolderBreadcrumbsResponse = z.infer<typeof v2FolderBreadcrumbsResponseSchema>

// ─── CRUD: Create ────────────────────────────────────────────────────────────

/** Body for POST /folders. parent_id is optional (null/omitted = root). */
export const v2FolderCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parent_id: z.string().nullable().optional(),
  color_tag: z.string().nullable().optional(),
})
export type V2FolderCreateRequest = z.infer<typeof v2FolderCreateRequestSchema>

/** Response body for POST /folders, GET /folders/:id, PATCH /folders/:id. */
export const v2FolderDetailResponseSchema = z.union([
  v2ResourceResponseSchema(v2FolderSchema),
  z.object({ folder: v2FolderSchema }),
])
export type V2FolderDetailResponse = z.infer<typeof v2FolderDetailResponseSchema>

// ─── CRUD: Update ────────────────────────────────────────────────────────────

/** Body for PATCH /folders/:id. All fields optional. */
export const v2FolderUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  color_tag: z.string().nullable().optional(),
})
export type V2FolderUpdateRequest = z.infer<typeof v2FolderUpdateRequestSchema>

// ─── CRUD: Delete ────────────────────────────────────────────────────────────

/**
 * Response body for DELETE /folders/:id.
 * - Soft delete (default): { success, id, permanent: false }
 * - Permanent delete (?permanent=true): { success, id, permanent: true, folders_deleted }
 */
const v2FolderDeleteActionSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  permanent: z.boolean(),
  folders_deleted: z.number().int().nonnegative().optional(),
})
export const v2FolderDeleteResponseSchema = z.union([
  v2ResourceResponseSchema(v2FolderDeleteActionSchema),
  v2FolderDeleteActionSchema,
])
export type V2FolderDeleteResponse = z.infer<typeof v2FolderDeleteResponseSchema>

// ─── CRUD: Restore ───────────────────────────────────────────────────────────

/** Response body for POST /folders/:id/restore. */
const v2FolderRestoreActionSchema = z.object({
  success: z.literal(true),
  id: z.string(),
})
export const v2FolderRestoreResponseSchema = z.union([
  v2ResourceResponseSchema(v2FolderRestoreActionSchema),
  v2FolderRestoreActionSchema,
])
export type V2FolderRestoreResponse = z.infer<typeof v2FolderRestoreResponseSchema>
