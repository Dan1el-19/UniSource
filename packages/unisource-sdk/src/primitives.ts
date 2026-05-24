import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────────────────────

export const nonEmptyString = z.string().trim().min(1);
export const positiveInt = z.number().int().positive();
export const nonNegativeInt = z.number().int().nonnegative();
export const unixTimestamp = z.number().int().nonnegative();

// ─── Pagination constants ─────────────────────────────────────────────────────

export const FILES_DEFAULT_LIMIT = 25;

/** Maximum items per list-page response (used by all v2 list endpoints). */
export const LIST_MAX_LIMIT = 100;

/** @deprecated Use LIST_MAX_LIMIT — semantically applies to all v2 list endpoints, not just files. */
export const FILES_MAX_LIMIT = LIST_MAX_LIMIT;

// ─── Upload Destination ──────────────────────────────────────────────────────

/**
 * Storage backend a file lives on.
 * - 'r2'      — Cloudflare R2 via presigned PUT / multipart
 * - 'appwrite' — Appwrite Storage via direct browser SDK upload
 *
 * `recommendedUploadDestinationSchema` adds the meta-value 'hybrid' which is
 * only valid as a service-wide setting (the upload manager picks r2/appwrite
 * per-file based on size).
 */
export const uploadDestinationSchema = z.enum(['r2', 'appwrite']);
export type UploadDestination = z.infer<typeof uploadDestinationSchema>;

export const recommendedUploadDestinationSchema = z.enum(['r2', 'appwrite', 'hybrid']);
export type RecommendedUploadDestination = z.infer<typeof recommendedUploadDestinationSchema>;

// ─── Upload Status ────────────────────────────────────────────────────────────

export const uploadStatusSchema = z.enum(['pending', 'completed', 'failed']);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

// ─── API Error ────────────────────────────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: nonEmptyString,
  message: nonEmptyString,
});
export type ApiError = z.infer<typeof apiErrorSchema>;
