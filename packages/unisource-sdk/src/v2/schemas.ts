import { z } from 'zod'
import { v2FileSchema } from './files'

export const v2ListQuerySchema = z.object({
  folder_id: z.string().nullable().optional(),
  search: z.string().optional(),
  mime_type: z.string().optional(),
  trash: z.enum(['active', 'trashed', 'all']).optional(),
  sort_by: z.enum(['created_at', 'updated_at', 'name', 'size']).optional(),
  sort_dir: z.enum(['asc', 'desc']).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).optional(),
})

export const v2PageSchema = z.object({
  limit: z.number(),
  next_cursor: z.string().nullable(),
})

export function v2ListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: v2PageSchema,
  })
}

export const v2ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    request_id: z.string(),
  }),
})

export function v2ResourceResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    item: itemSchema,
  })
}

export const v2FilesListResponseSchema = v2ListResponseSchema(v2FileSchema)
