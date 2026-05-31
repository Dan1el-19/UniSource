import { z } from 'zod'
import { v2ListResponseSchema, v2ResourceResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

export const v2AdminUploadSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  user_id: z.string().nullable(),
  folder_id: z.string().nullable().optional(),
  filename: z.string(),
  size: z.number(),
  mime_type: z.string(),
  destination: z.string(),
  status: z.string(),
  expires_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
})

export const v2AdminFilesListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  destination: z.string().optional(),
  status: z.string().optional(),
})

export const v2AdminFilesListResponseSchema = v2ListResponseSchema(v2AdminUploadSchema)
export const v2AdminFileResponseSchema = v2ResourceResponseSchema(v2AdminUploadSchema)
export const v2AdminFileDownloadResponseSchema = v2ResourceResponseSchema(z.object({
  upload_id: z.string(),
  destination: z.string(),
  download_url: z.string().url(),
  expires_at: z.number(),
}))
export const v2AdminFileDeleteResponseSchema = v2ResourceResponseSchema(z.object({
  id: z.string(),
  deleted: z.literal(true),
  permanent: z.literal(true),
}))

export type V2AdminUpload = z.infer<typeof v2AdminUploadSchema>
export type V2AdminFilesListQuery = z.infer<typeof v2AdminFilesListQuerySchema>
export type V2AdminFilesListResponse = z.infer<typeof v2AdminFilesListResponseSchema>
export type V2AdminFileResponse = z.infer<typeof v2AdminFileResponseSchema>
export type V2AdminFileDownloadResponse = z.infer<typeof v2AdminFileDownloadResponseSchema>
export type V2AdminFileDeleteResponse = z.infer<typeof v2AdminFileDeleteResponseSchema>

export function createAdminFilesResource(request: V2Request) {
  return {
    list: (query?: V2AdminFilesListQuery, signal?: AbortSignal): Promise<V2AdminFilesListResponse> =>
      request('GET', '/v2/admin/files', { query, signal, parser: v2AdminFilesListResponseSchema }),
    get: (id: string, signal?: AbortSignal): Promise<V2AdminFileResponse> =>
      request('GET', `/v2/admin/files/${encodeURIComponent(id)}`, { signal, parser: v2AdminFileResponseSchema }),
    downloadUrl: (id: string, signal?: AbortSignal): Promise<V2AdminFileDownloadResponse> =>
      request('GET', `/v2/admin/files/${encodeURIComponent(id)}/download-url`, { signal, parser: v2AdminFileDownloadResponseSchema }),
    delete: (id: string, signal?: AbortSignal): Promise<V2AdminFileDeleteResponse> =>
      request('DELETE', `/v2/admin/files/${encodeURIComponent(id)}`, { signal, parser: v2AdminFileDeleteResponseSchema }),
  }
}
