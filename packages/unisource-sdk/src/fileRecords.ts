import { z } from 'zod';
import { uploadDestinationSchema } from './index';

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.number().int().positive();

// Full file record (confirmed upload in the `files` D1 table)
export const fileRecordFullSchema = z.object({
  id: nonEmptyStringSchema,
  user_id: nonEmptyStringSchema,
  folder_id: nonEmptyStringSchema.nullable(),
  upload_id: nonEmptyStringSchema.nullable(),
  filename: nonEmptyStringSchema,
  size: positiveIntegerSchema,
  mime_type: nonEmptyStringSchema,
  storage_destination: uploadDestinationSchema,
  storage_key: nonEmptyStringSchema,
  bucket: nonEmptyStringSchema,
  is_trashed: z.boolean(),
  trashed_at: positiveIntegerSchema.nullable(),
  created_at: positiveIntegerSchema,
  updated_at: positiveIntegerSchema,
});
export type FileRecordFullResponse = z.infer<typeof fileRecordFullSchema>;

export const fileRecordsListResponseSchema = z.object({
  items: z.array(fileRecordFullSchema),
  next_cursor: z.string().nullable(),
  limit: z.number().int().positive(),
});
export type FileRecordsListResponse = z.infer<typeof fileRecordsListResponseSchema>;

export const fileMoveRequestSchema = z.object({
  folder_id: nonEmptyStringSchema.nullable().optional(),
});
export type FileMoveRequest = z.infer<typeof fileMoveRequestSchema>;
