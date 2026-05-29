import { z } from 'zod'
import type {
  SharesCreateRequest,
} from '../../v1/shareLinks'
import { shareLinkSchema } from '../../v1/shareLinks'
import { v2ListResponseSchema, v2ResourceResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

const v2ShareResponseSchema = z.union([
  v2ResourceResponseSchema(shareLinkSchema),
  z.object({ link: shareLinkSchema }),
])
const v2ShareListResponseSchema = z.union([
  v2ListResponseSchema(shareLinkSchema),
  z.object({ items: z.array(shareLinkSchema) }),
])
const v2ShareDeleteActionSchema = z.union([
  z.object({
    id: z.string(),
    deleted: z.literal(true),
  }),
  z.object({
    success: z.literal(true),
    id: z.string(),
  }),
])
const v2ShareDeleteResponseSchema = z.union([
  v2ResourceResponseSchema(v2ShareDeleteActionSchema),
  v2ShareDeleteActionSchema,
])

type V2ShareResponse = z.infer<typeof v2ShareResponseSchema>
type V2ShareListResponse = z.infer<typeof v2ShareListResponseSchema>
type V2ShareDeleteResponse = z.infer<typeof v2ShareDeleteResponseSchema>

export function createSharesResource(request: V2Request) {
  return {
    list: (
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareListResponse> =>
      request('GET', '/shares', {
        signal,
        asUser: options?.asUser,
        parser: v2ShareListResponseSchema,
      }),
    create: (
      body: SharesCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareResponse> =>
      request('POST', '/shares', {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2ShareResponseSchema,
      }),
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareResponse> =>
      request('GET', `/shares/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2ShareResponseSchema,
      }),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ShareDeleteResponse> =>
      request('DELETE', `/shares/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2ShareDeleteResponseSchema,
      }),
  }
}
