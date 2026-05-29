import { z } from 'zod'
import { v2ListResponseSchema, v2ResourceResponseSchema } from './schemas'

/**
 * Schemas for the `client.myFiles` resource — bound to the legacy
 * `/my-files` router (apps/backend/src/routes/fileRecords.ts).
 *
 * V2 clients opt into the shared-route V2 envelope `{ items, page }`.
 */

// ─── File record (public projection — storage_key/bucket excluded) ──────────

export const v2MyFileSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  user_id: z.string(),
  folder_id: z.string().nullable(),
  upload_id: z.string().nullable(),
  filename: z.string(),
  size: z.number().int().nonnegative(),
  mime_type: z.string(),
  storage_destination: z.enum(['r2', 'appwrite']),
  is_trashed: z.boolean(),
  trashed_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export type V2MyFile = z.infer<typeof v2MyFileSchema>

// ─── List query ─────────────────────────────────────────────────────────────

export const v2MyFilesListQuerySchema = z.object({
  folder_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).optional(),
})

export type V2MyFilesListQuery = z.infer<typeof v2MyFilesListQuerySchema>

// ─── List / trash response (flat V1-style envelope) ────────────────────────

const v2MyFilesLegacyListResponseSchema = z.object({
  items: z.array(v2MyFileSchema),
  next_cursor: z.string().nullable(),
  limit: z.number().int().positive(),
})

export const v2MyFilesListResponseSchema = z.union([
  v2ListResponseSchema(v2MyFileSchema),
  v2MyFilesLegacyListResponseSchema,
])

export type V2MyFilesListResponse = z.infer<typeof v2MyFilesListResponseSchema>

// ─── Trash list query (no folder_id) ────────────────────────────────────────

export const v2MyFilesTrashListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).optional(),
})

export type V2MyFilesTrashListQuery = z.infer<typeof v2MyFilesTrashListQuerySchema>

// ─── Move request / response ────────────────────────────────────────────────

/** Body for PATCH /my-files/:id/move. `null` = root. */
export const v2MyFilesMoveRequestSchema = z.object({
  folder_id: z.string().nullable(),
})

export type V2MyFilesMoveRequest = z.infer<typeof v2MyFilesMoveRequestSchema>

const v2MyFilesMoveActionSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  folder_id: z.string().nullable(),
})

export const v2MyFilesMoveResponseSchema = z.union([
  v2ResourceResponseSchema(v2MyFilesMoveActionSchema),
  v2MyFilesMoveActionSchema,
])

export type V2MyFilesMoveResponse = z.infer<typeof v2MyFilesMoveResponseSchema>
