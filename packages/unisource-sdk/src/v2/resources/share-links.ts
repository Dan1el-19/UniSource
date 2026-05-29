import { z } from 'zod'
import type {
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
} from '../../v1/shareLinks'
import { shareLinkSchema } from '../../v1/shareLinks'
import { v2ListResponseSchema, v2ResourceResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

const v2ShareLinkResponseSchema = z.union([
  v2ResourceResponseSchema(shareLinkSchema),
  z.object({ link: shareLinkSchema }),
])
const v2ShareLinkListResponseSchema = z.union([
  v2ListResponseSchema(shareLinkSchema),
  z.object({ items: z.array(shareLinkSchema) }),
])
const v2ShareLinkDeleteActionSchema = z.union([
  z.object({
    id: z.string(),
    deleted: z.literal(true),
  }),
  z.object({
    success: z.literal(true),
    id: z.string(),
  }),
])
const v2ShareLinkDeleteResponseSchema = z.union([
  v2ResourceResponseSchema(v2ShareLinkDeleteActionSchema),
  v2ShareLinkDeleteActionSchema,
])

type V2ShareLinkResponse = z.infer<typeof v2ShareLinkResponseSchema>
type V2ShareLinkListResponse = z.infer<typeof v2ShareLinkListResponseSchema>
type V2ShareLinkDeleteResponse = z.infer<typeof v2ShareLinkDeleteResponseSchema>

export function createShareLinksResource(request: V2Request) {
  return {
    create: (
      fileId: string,
      body: ShareLinkCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareLinkResponse> =>
      request('POST', `/my-files/${encodeURIComponent(fileId)}/share-links`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2ShareLinkResponseSchema,
      }),
    listForFile: (
      fileId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareLinkListResponse> =>
      request('GET', `/my-files/${encodeURIComponent(fileId)}/share-links`, {
        signal,
        asUser: options?.asUser,
        parser: v2ShareLinkListResponseSchema,
      }),
    update: (
      linkId: string,
      body: ShareLinkUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareLinkResponse> =>
      request('PATCH', `/share-links/${encodeURIComponent(linkId)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2ShareLinkResponseSchema,
      }),
    delete: (
      linkId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareLinkDeleteResponse> =>
      request('DELETE', `/share-links/${encodeURIComponent(linkId)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2ShareLinkDeleteResponseSchema,
      }),
  }
}
