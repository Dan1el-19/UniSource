import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const positiveInt = z.number().int().positive()

// ─── Init: R2 ────────────────────────────────────────────────────────────────

export const v2UploadR2InitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadR2InitRequest = z.input<typeof v2UploadR2InitRequestSchema>

export const v2UploadR2InitItemSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('r2'),
  presigned_url: z.string().url(),
  storage_key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
})

export const v2UploadR2InitResponseSchema = z.object({
  item: v2UploadR2InitItemSchema,
})
export type V2UploadR2InitResponse = z.infer<typeof v2UploadR2InitResponseSchema>

// ─── Init: Appwrite ──────────────────────────────────────────────────────────

export const v2UploadAppwriteInitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadAppwriteInitRequest = z.input<typeof v2UploadAppwriteInitRequestSchema>

export const v2UploadAppwriteInitItemSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('appwrite'),
  appwrite_endpoint: z.string().url(),
  appwrite_project_id: nonEmptyString,
  appwrite_bucket_id: nonEmptyString,
  file_id: nonEmptyString,
  expires_at: positiveInt,
  /** Appwrite JWT — present only when caller authenticates with JWT (not API key). */
  jwt: nonEmptyString.optional(),
})

export const v2UploadAppwriteInitResponseSchema = z.object({
  item: v2UploadAppwriteInitItemSchema,
})
export type V2UploadAppwriteInitResponse = z.infer<typeof v2UploadAppwriteInitResponseSchema>

// ─── Lifecycle: complete (single) ────────────────────────────────────────────

export const v2UploadCompleteRequestSchema = z.object({
  upload_id: nonEmptyString,
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadCompleteRequest = z.input<typeof v2UploadCompleteRequestSchema>

export const v2UploadLifecycleItemSchema = z.object({
  id: nonEmptyString,
  status: z.enum(['completed', 'failed']),
  upload_type: z.enum(['single', 'multipart']),
  /** New file row id created from the upload — present only after a successful complete. */
  file_id: nonEmptyString.nullable(),
})

export const v2UploadLifecycleResponseSchema = z.object({
  item: v2UploadLifecycleItemSchema,
})
export type V2UploadLifecycleResponse = z.infer<typeof v2UploadLifecycleResponseSchema>

// ─── Multipart: create ───────────────────────────────────────────────────────

export const v2MultipartCreateRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2MultipartCreateRequest = z.input<typeof v2MultipartCreateRequestSchema>

export const v2MultipartCreateItemSchema = z.object({
  upload_id: nonEmptyString,
  r2_upload_id: nonEmptyString,
  key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
})

export const v2MultipartCreateResponseSchema = z.object({
  item: v2MultipartCreateItemSchema,
})
export type V2MultipartCreateResponse = z.infer<typeof v2MultipartCreateResponseSchema>

// ─── Multipart: sign-part ────────────────────────────────────────────────────

export const v2MultipartSignPartQuerySchema = z.object({
  upload_id: nonEmptyString,
  part_number: z.coerce.number().int().min(1).max(10_000),
})
export type V2MultipartSignPartQuery = z.input<typeof v2MultipartSignPartQuerySchema>

export const v2MultipartSignPartItemSchema = z.object({
  url: z.string().url(),
  expires_at: positiveInt,
})

export const v2MultipartSignPartResponseSchema = z.object({
  item: v2MultipartSignPartItemSchema,
})
export type V2MultipartSignPartResponse = z.infer<typeof v2MultipartSignPartResponseSchema>

// ─── Multipart: list-parts (V2 list envelope) ────────────────────────────────

export const v2MultipartPartSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: nonEmptyString,
  Size: z.number().int().nonnegative(),
})
export type V2MultipartPart = z.infer<typeof v2MultipartPartSchema>

export const v2MultipartListPartsResponseSchema = z.object({
  items: z.array(v2MultipartPartSchema),
  page: z.object({
    limit: positiveInt,
    next_cursor: z.string().nullable(),
  }),
})
export type V2MultipartListPartsResponse = z.infer<typeof v2MultipartListPartsResponseSchema>

// ─── Multipart: complete ─────────────────────────────────────────────────────

export const v2MultipartCompleteRequestSchema = z.object({
  upload_id: nonEmptyString,
  parts: z
    .array(z.object({
      PartNumber: z.number().int().min(1).max(10_000),
      ETag: nonEmptyString,
    }))
    .min(1),
})
export type V2MultipartCompleteRequest = z.input<typeof v2MultipartCompleteRequestSchema>

export const v2MultipartCompleteResponseSchema = v2UploadLifecycleResponseSchema
export type V2MultipartCompleteResponse = z.infer<typeof v2MultipartCompleteResponseSchema>

// ─── Multipart: abort ────────────────────────────────────────────────────────

export const v2MultipartAbortRequestSchema = z.object({
  upload_id: nonEmptyString,
})
export type V2MultipartAbortRequest = z.input<typeof v2MultipartAbortRequestSchema>

export const v2MultipartAbortResponseSchema = v2UploadLifecycleResponseSchema
export type V2MultipartAbortResponse = z.infer<typeof v2MultipartAbortResponseSchema>
