import { z } from 'zod';
import { nonEmptyString, positiveInt, unixTimestamp } from './primitives';

export const shareLinkSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  file_id: nonEmptyString,
  user_id: nonEmptyString,
  slug: nonEmptyString,
  name: z.string().nullable(),
  has_password: z.boolean(),
  expires_at: unixTimestamp.nullable(),
  download_count: z.number().int().nonnegative(),
  max_downloads: positiveInt.nullable(),
  is_active: z.boolean(),
  created_at: unixTimestamp,
  updated_at: unixTimestamp,
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const shareLinkCreateRequestSchema = z.object({
  slug: z.string().trim().min(3).max(64).optional(),
  name: z.string().trim().max(128).optional(),
  password: z.string().min(1).optional(),
  expires_at: unixTimestamp.optional(),
  max_downloads: positiveInt.optional(),
});
export type ShareLinkCreateRequest = z.infer<typeof shareLinkCreateRequestSchema>;

export const shareLinkUpdateRequestSchema = z.object({
  name: z.string().trim().max(128).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).nullable().optional(),
  expires_at: unixTimestamp.nullable().optional(),
  max_downloads: positiveInt.nullable().optional(),
});
export type ShareLinkUpdateRequest = z.infer<typeof shareLinkUpdateRequestSchema>;

export const shareLinkListResponseSchema = z.object({
  items: z.array(shareLinkSchema),
});
export type ShareLinkListResponse = z.infer<typeof shareLinkListResponseSchema>;

export const shareLinkCreateResponseSchema = z.object({
  link: shareLinkSchema,
});
export type ShareLinkCreateResponse = z.infer<typeof shareLinkCreateResponseSchema>;

export const shareLinkUpdateResponseSchema = z.object({
  link: shareLinkSchema,
});
export type ShareLinkUpdateResponse = z.infer<typeof shareLinkUpdateResponseSchema>;

// Returned when link has no password OR after unlock
export const publicFileAccessResponseSchema = z.object({
  file_id: nonEmptyString,
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(false),
  download_url: z.string().url(),
  url_expires_at: unixTimestamp,
  link_name: z.string().nullable(),
  link_expires_at: unixTimestamp.nullable(),
});
export type PublicFileAccessResponse = z.infer<typeof publicFileAccessResponseSchema>;

// Returned when link requires password (no download URL)
export const publicFileLockedResponseSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(true),
  link_name: z.string().nullable(),
});
export type PublicFileLockedResponse = z.infer<typeof publicFileLockedResponseSchema>;
