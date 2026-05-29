import { z } from 'zod'
import type { FileUpdateRequest } from '../../fileRecords'
import { fileDownloadUrlResponseSchema, fileRecordSchema } from '../../fileRecords'
import { v2ResourceResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

const v2FileRecordDetailResponseSchema = z.union([
  v2ResourceResponseSchema(fileRecordSchema),
  z.object({ file: fileRecordSchema }),
])
const v2FileUpdateResponseSchema = v2FileRecordDetailResponseSchema
const v2FileDownloadUrlResponseSchema = z.union([
  v2ResourceResponseSchema(fileDownloadUrlResponseSchema),
  fileDownloadUrlResponseSchema,
])
const v2FileDeleteActionSchema = z.union([
  z.object({
    id: z.string(),
    deleted: z.boolean(),
    permanent: z.boolean(),
  }),
  z.object({
    success: z.literal(true),
    id: z.string(),
    permanent: z.boolean(),
  }),
])
const v2FileDeleteResponseSchema = z.union([
  v2ResourceResponseSchema(v2FileDeleteActionSchema),
  v2FileDeleteActionSchema,
])
const v2FileRestoreActionSchema = z.union([
  z.object({
    id: z.string(),
    restored: z.literal(true),
  }),
  z.object({
    success: z.literal(true),
    id: z.string(),
  }),
])
const v2FileRestoreResponseSchema = z.union([
  v2ResourceResponseSchema(v2FileRestoreActionSchema),
  v2FileRestoreActionSchema,
])

type V2FileRecordDetailResponse = z.infer<typeof v2FileRecordDetailResponseSchema>
type V2FileUpdateResponse = z.infer<typeof v2FileUpdateResponseSchema>
type V2FileDownloadUrlResponse = z.infer<typeof v2FileDownloadUrlResponseSchema>
type V2FileDeleteResponse = z.infer<typeof v2FileDeleteResponseSchema>
type V2FileRestoreResponse = z.infer<typeof v2FileRestoreResponseSchema>

export function createUserFilesResource(request: V2Request) {
  return {
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FileRecordDetailResponse> =>
      request('GET', `/files/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2FileRecordDetailResponseSchema,
      }),
    update: (
      id: string,
      body: FileUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FileUpdateResponse> =>
      request('PATCH', `/files/${encodeURIComponent(id)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2FileUpdateResponseSchema,
      }),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<V2FileDeleteResponse> =>
      request('DELETE', `/files/${encodeURIComponent(id)}`, {
        query: options?.permanent ? { permanent: true } : undefined,
        signal,
        asUser: options?.asUser,
        parser: v2FileDeleteResponseSchema,
      }),
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FileRestoreResponse> =>
      request('POST', `/files/${encodeURIComponent(id)}/restore`, {
        signal,
        asUser: options?.asUser,
        parser: v2FileRestoreResponseSchema,
      }),
    downloadUrl: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FileDownloadUrlResponse> =>
      request('GET', `/files/${encodeURIComponent(id)}/download-url`, {
        signal,
        asUser: options?.asUser,
        parser: v2FileDownloadUrlResponseSchema,
      }),
  }
}
