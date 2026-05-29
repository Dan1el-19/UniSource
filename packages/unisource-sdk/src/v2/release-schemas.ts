import { z } from 'zod'
import { v2PageSchema } from './schemas'
import { v2BulkFailureSchema } from './bulk-schemas'

const nonEmptyString = z.string().trim().min(1)
const positiveInt = z.number().int().positive()
const nonNegativeInt = z.number().int().nonnegative()
const releaseId = z.string().trim().min(1).max(128)
const releaseName = z.string().trim().min(1).max(256)
const filename = z.string().trim().min(1).max(255)
const tags = z.array(z.string().trim().min(1).max(64)).max(32)
const notes = z.string().trim().max(10_000).nullable().optional()

export const v2ReleaseSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  name: nonEmptyString,
  size: nonNegativeInt,
  r2_key: nonEmptyString,
  tags: z.array(nonEmptyString),
  notes: z.string().nullable(),
  force_update: z.boolean(),
  uploaded_by: nonEmptyString,
  upload_status: z.enum(['pending', 'completed', 'failed']),
  created_at: nonEmptyString,
})
export type V2Release = z.infer<typeof v2ReleaseSchema>

export const v2ReleaseListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: nonEmptyString.optional(),
})
export type V2ReleaseListQuery = z.input<typeof v2ReleaseListQuerySchema>

export const v2ReleaseListResponseSchema = z.object({
  items: z.array(v2ReleaseSchema),
  page: v2PageSchema,
})
export type V2ReleaseListResponse = z.infer<typeof v2ReleaseListResponseSchema>

export const v2ReleaseResourceResponseSchema = z.object({ item: v2ReleaseSchema })
export type V2ReleaseResourceResponse = z.infer<typeof v2ReleaseResourceResponseSchema>

export const v2ReleaseUploadInitRequestSchema = z.object({
  name: releaseName,
  filename,
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseUploadInitRequest = z.input<typeof v2ReleaseUploadInitRequestSchema>

export const v2ReleaseUploadInitResponseSchema = z.object({
  item: z.object({
    release_id: nonEmptyString,
    presigned_url: z.string().url(),
    r2_key: nonEmptyString,
    expires_at: positiveInt,
  }),
})
export type V2ReleaseUploadInitResponse = z.infer<typeof v2ReleaseUploadInitResponseSchema>

export const v2ReleaseUploadCompleteRequestSchema = z.object({
  release_id: releaseId,
  size: nonNegativeInt,
})
export type V2ReleaseUploadCompleteRequest = z.input<typeof v2ReleaseUploadCompleteRequestSchema>

export const v2ReleaseLifecycleResponseSchema = z.object({
  item: z.object({
    id: nonEmptyString,
    status: z.enum(['completed', 'failed']),
  }),
})
export type V2ReleaseLifecycleResponse = z.infer<typeof v2ReleaseLifecycleResponseSchema>

export const v2ReleaseMultipartCreateRequestSchema = z.object({
  name: releaseName,
  filename,
  mime_type: nonEmptyString.optional().default('application/octet-stream'),
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseMultipartCreateRequest = z.input<typeof v2ReleaseMultipartCreateRequestSchema>

export const v2ReleaseMultipartCreateResponseSchema = z.object({
  item: z.object({
    upload_id: nonEmptyString,
    r2_upload_id: nonEmptyString,
    key: nonEmptyString,
    bucket: nonEmptyString,
    expires_at: positiveInt,
  }),
})
export type V2ReleaseMultipartCreateResponse = z.infer<typeof v2ReleaseMultipartCreateResponseSchema>

export const v2ReleaseMultipartSignPartQuerySchema = z.object({
  upload_id: releaseId,
  part_number: z.coerce.number().int().min(1).max(10_000),
})

export const v2ReleaseMultipartSignPartResponseSchema = z.object({
  item: z.object({ url: z.string().url(), expires_at: positiveInt }),
})
export type V2ReleaseMultipartSignPartResponse = z.infer<typeof v2ReleaseMultipartSignPartResponseSchema>

export const v2ReleaseMultipartPartSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: nonEmptyString,
  Size: nonNegativeInt,
})
export type V2ReleaseMultipartPart = z.infer<typeof v2ReleaseMultipartPartSchema>

export const v2ReleaseMultipartListPartsResponseSchema = z.object({
  items: z.array(v2ReleaseMultipartPartSchema),
  page: v2PageSchema,
})
export type V2ReleaseMultipartListPartsResponse = z.infer<typeof v2ReleaseMultipartListPartsResponseSchema>

export const v2ReleaseMultipartCompleteRequestSchema = z.object({
  upload_id: releaseId,
  parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10_000), ETag: nonEmptyString })).min(1),
})
export type V2ReleaseMultipartCompleteRequest = z.input<typeof v2ReleaseMultipartCompleteRequestSchema>

export const v2ReleaseMultipartAbortRequestSchema = z.object({ upload_id: releaseId })

export const v2ReleaseUpdateRequestSchema = z
  .object({
    name: releaseName.optional(),
    tags: tags.optional(),
    notes,
    force_update: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  })
export type V2ReleaseUpdateRequest = z.input<typeof v2ReleaseUpdateRequestSchema>

export const v2ReleaseDeleteResponseSchema = z.object({ item: z.object({ id: nonEmptyString, deleted: z.literal(true) }) })
export type V2ReleaseDeleteResponse = z.infer<typeof v2ReleaseDeleteResponseSchema>

export const v2ReleaseSyncManifestSchema = z.object({
  id: releaseId.optional(),
  name: releaseName,
  r2_key: z.string().trim().min(1).max(1024),
  size: nonNegativeInt,
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseSyncManifest = z.input<typeof v2ReleaseSyncManifestSchema>

export const v2ReleaseSyncRequestSchema = z.object({
  releases: z.array(v2ReleaseSyncManifestSchema).min(1).max(100),
})
export type V2ReleaseSyncRequest = z.input<typeof v2ReleaseSyncRequestSchema>

export const v2ReleaseSyncResponseSchema = z.object({
  processed: z.array(nonEmptyString),
  failed: z.array(v2BulkFailureSchema),
})
export type V2ReleaseSyncResponse = z.infer<typeof v2ReleaseSyncResponseSchema>
