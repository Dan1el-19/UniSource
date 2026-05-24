import { z } from 'zod'

export const v2FileSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  user_id: z.string(),
  folder_id: z.string().nullable(),
  upload_id: z.string().nullable(),
  filename: z.string(),
  size: z.number(),
  mime_type: z.string(),
  storage_destination: z.enum(['r2', 'appwrite']),
  is_trashed: z.boolean(),
  trashed_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export type V2File = z.infer<typeof v2FileSchema>
