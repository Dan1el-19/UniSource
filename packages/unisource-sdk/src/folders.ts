import { z } from 'zod';

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.number().int().positive();

// --- Schemas ---

export const folderCreateRequestSchema = z.object({
  name: nonEmptyStringSchema,
  parent_id: nonEmptyStringSchema.optional(),
  color_tag: z.string().optional(),
});
export type FolderCreateRequest = z.infer<typeof folderCreateRequestSchema>;

export const folderUpdateRequestSchema = z
  .object({
    name: nonEmptyStringSchema.optional(),
    color_tag: z.string().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || 'color_tag' in v, {
    message: 'At least one of name or color_tag must be provided',
  });
export type FolderUpdateRequest = z.infer<typeof folderUpdateRequestSchema>;

export const folderResponseSchema = z.object({
  id: nonEmptyStringSchema,
  user_id: nonEmptyStringSchema,
  parent_id: nonEmptyStringSchema.nullable(),
  name: nonEmptyStringSchema,
  color_tag: z.string().nullable(),
  is_trashed: z.boolean(),
  trashed_at: positiveIntegerSchema.nullable(),
  created_at: positiveIntegerSchema,
  updated_at: positiveIntegerSchema,
});
export type FolderResponse = z.infer<typeof folderResponseSchema>;

export const folderListResponseSchema = z.object({
  items: z.array(folderResponseSchema),
});
export type FolderListResponse = z.infer<typeof folderListResponseSchema>;
