import { z } from 'zod'
import { LIST_MAX_LIMIT } from '../primitives'
import { v2ListResponseSchema } from './schemas'

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
  parent_id: z.string().optional(),
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
