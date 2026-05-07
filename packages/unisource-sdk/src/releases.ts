import { z } from 'zod';
import { nonEmptyString, positiveInt, uploadStatusSchema } from './primitives';

const releaseIdSchema = z.string().trim().min(1).max(128);
const releaseNameSchema = z.string().trim().min(1).max(256);
const releaseFilenameSchema = z.string().trim().min(1).max(255);
const releaseTagsSchema = z.array(z.string().trim().min(1).max(64)).max(32);
const releaseNotesSchema = z.string().trim().max(10_000).nullable().optional();
const releaseR2KeySchema = z.string().trim().min(1).max(1024);

// ─── Release DTO ─────────────────────────────────────────────────────────────

export const releaseDTOSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  name: nonEmptyString,
  size: z.number().int().nonnegative(),
  r2_key: nonEmptyString,
  tags: z.array(nonEmptyString),
  notes: z.string().nullable(),
  force_update: z.boolean(),
  uploaded_by: nonEmptyString,
  upload_status: uploadStatusSchema,
  created_at: nonEmptyString,
});
export type ReleaseDTO = z.infer<typeof releaseDTOSchema>;

// ─── Upload Lifecycle ───────────────────────────────────────────────────────

export const releaseUploadInitRequestSchema = z.object({
  name: releaseNameSchema,
  filename: releaseFilenameSchema,
  tags: releaseTagsSchema.optional().default([]),
  notes: releaseNotesSchema,
  force_update: z.boolean().optional().default(false),
});
export type ReleaseUploadInitRequest = z.input<typeof releaseUploadInitRequestSchema>;

export const releaseUploadInitResponseSchema = z.object({
  release_id: nonEmptyString,
  presigned_url: z.string().url(),
  r2_key: nonEmptyString,
  expires_at: positiveInt,
});
export type ReleaseUploadInitResponse = z.infer<typeof releaseUploadInitResponseSchema>;

export const releaseUploadCompleteRequestSchema = z.object({
  release_id: releaseIdSchema,
  size: z.number().int().nonnegative(),
});
export type ReleaseUploadCompleteRequest = z.infer<typeof releaseUploadCompleteRequestSchema>;

export const releaseUploadCompleteResponseSchema = z.object({
  success: z.literal(true),
  release_id: nonEmptyString,
  status: z.literal('completed'),
});
export type ReleaseUploadCompleteResponse = z.infer<typeof releaseUploadCompleteResponseSchema>;

export const releaseUploadFailResponseSchema = z.object({
  success: z.literal(true),
  release_id: nonEmptyString,
  status: z.literal('failed'),
});
export type ReleaseUploadFailResponse = z.infer<typeof releaseUploadFailResponseSchema>;

// ─── List ───────────────────────────────────────────────────────────────────

export const releasesListQuerySchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  cursor: nonEmptyString.optional(),
});
export type ReleasesListQuery = z.infer<typeof releasesListQuerySchema>;

export const releasesListResponseSchema = z.object({
  items: z.array(releaseDTOSchema),
  next_cursor: z.string().nullable(),
});
export type ReleasesListResponse = z.infer<typeof releasesListResponseSchema>;

// ─── Update ─────────────────────────────────────────────────────────────────

export const releaseUpdateRequestSchema = z
  .object({
    name: releaseNameSchema.optional(),
    tags: releaseTagsSchema.optional(),
    notes: releaseNotesSchema,
    force_update: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });
export type ReleaseUpdateRequest = z.infer<typeof releaseUpdateRequestSchema>;

// ─── Delete ─────────────────────────────────────────────────────────────────

export const releaseDeleteResponseSchema = z.object({
  success: z.literal(true),
  release_id: nonEmptyString,
});
export type ReleaseDeleteResponse = z.infer<typeof releaseDeleteResponseSchema>;

// ─── Sync ───────────────────────────────────────────────────────────────────

export const releaseSyncManifestSchema = z.object({
  id: releaseIdSchema.optional(),
  name: releaseNameSchema,
  r2_key: releaseR2KeySchema,
  size: z.number().int().nonnegative(),
  tags: releaseTagsSchema.optional().default([]),
  notes: releaseNotesSchema,
  force_update: z.boolean().optional().default(false),
});
export type ReleaseSyncManifest = z.input<typeof releaseSyncManifestSchema>;

export const releaseSyncRequestSchema = z.object({
  releases: z.array(releaseSyncManifestSchema).min(1).max(100),
});
export type ReleaseSyncRequest = z.input<typeof releaseSyncRequestSchema>;

export const releaseSyncResultSchema = z.object({
  release_id: nonEmptyString,
  success: z.boolean(),
  status: uploadStatusSchema,
});
export type ReleaseSyncResult = z.infer<typeof releaseSyncResultSchema>;

export const releaseSyncResponseSchema = z.object({
  synced: z.number().int().nonnegative(),
  results: z.array(releaseSyncResultSchema),
});
export type ReleaseSyncResponse = z.infer<typeof releaseSyncResponseSchema>;
