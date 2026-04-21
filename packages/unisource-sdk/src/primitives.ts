import { z } from 'zod';

// ─── Primitives ─────────────────────────────────────────────────────────────

export const nonEmptyString = z.string().trim().min(1);
export const positiveInt = z.number().int().positive();
export const unixTimestamp = z.number().int().nonnegative();

// ─── Pagination constants ─────────────────────────────────────────────────────

export const FILES_DEFAULT_LIMIT = 25;
export const FILES_MAX_LIMIT = 100;

// ─── Upload Destination ──────────────────────────────────────────────────────

export const uploadDestinationSchema = z.enum(['r2', 'appwrite']);
export type UploadDestination = z.infer<typeof uploadDestinationSchema>;

// ─── Upload Status ────────────────────────────────────────────────────────────

export const uploadStatusSchema = z.enum(['pending', 'completed', 'failed']);
export type UploadStatus = z.infer<typeof uploadStatusSchema>;

// ─── API Error ────────────────────────────────────────────────────────────────

export const apiErrorSchema = z.object({
  error: nonEmptyString,
  message: nonEmptyString,
});
export type ApiError = z.infer<typeof apiErrorSchema>;
