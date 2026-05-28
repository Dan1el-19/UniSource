import { z } from 'zod'
import { nonEmptyString, positiveInt, unixTimestamp } from '../primitives'

/**
 * Response shape from `GET /public/:slug` and `POST /public/:slug/unlock`
 * when the link does NOT require a password (or after a successful unlock).
 *
 * Mirrors `apps/backend/src/routes/public.ts`:
 * - GET handler `/public/:slug` (no-password branch)
 * - POST handler `/public/:slug/unlock` (always returns this shape on success)
 */
export const publicShareLinkUnlockedResponseSchema = z.object({
  file_id: nonEmptyString,
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(false),
  download_url: z.string().url(),
  url_expires_at: unixTimestamp,
  link_name: z.string().nullable(),
  link_expires_at: unixTimestamp.nullable(),
})
export type PublicShareLinkUnlockedResponse = z.infer<
  typeof publicShareLinkUnlockedResponseSchema
>

/**
 * Response shape from `GET /public/:slug` when the link IS password-protected.
 * Backend omits `download_url` / `url_expires_at` / `file_id` until unlocked.
 */
export const publicShareLinkLockedResponseSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(true),
  link_name: z.string().nullable(),
})
export type PublicShareLinkLockedResponse = z.infer<
  typeof publicShareLinkLockedResponseSchema
>

/**
 * Discriminated union for `GET /public/:slug` responses.
 * Use the `requires_password` flag to narrow.
 */
export const publicShareLinkResponseSchema = z.discriminatedUnion('requires_password', [
  publicShareLinkUnlockedResponseSchema,
  publicShareLinkLockedResponseSchema,
])
export type PublicShareLinkResponse = z.infer<typeof publicShareLinkResponseSchema>

/**
 * Response shape from `POST /public/:slug/unlock` — the link must be unlocked
 * after a successful password check, so this is always the "unlocked" shape.
 */
export const publicUnlockResponseSchema = publicShareLinkUnlockedResponseSchema
export type PublicUnlockResponse = PublicShareLinkUnlockedResponse

export const unlockShareLinkRequestSchema = z.object({
  password: z.string().min(1),
})
export type UnlockShareLinkRequest = z.infer<typeof unlockShareLinkRequestSchema>
