import type {
  ShareLinkCreateResponse,
  ShareLinkDeleteResponse,
  ShareLinkDetailResponse,
  ShareLinkListResponse,
  SharesCreateRequest,
} from '../../shareLinks'
import {
  shareLinkCreateResponseSchema,
  shareLinkDeleteResponseSchema,
  shareLinkDetailResponseSchema,
  shareLinkListResponseSchema,
} from '../../shareLinks'
import type { V2Request } from '../transport'

export function createSharesResource(request: V2Request) {
  return {
    list: (
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkListResponse> =>
      request('GET', '/shares', {
        signal,
        asUser: options?.asUser,
        parser: shareLinkListResponseSchema,
      }),
    create: (
      body: SharesCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkCreateResponse> =>
      request('POST', '/shares', {
        body,
        signal,
        asUser: options?.asUser,
        parser: shareLinkCreateResponseSchema,
      }),
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDetailResponse> =>
      request('GET', `/shares/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: shareLinkDetailResponseSchema,
      }),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDeleteResponse> =>
      request('DELETE', `/shares/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: shareLinkDeleteResponseSchema,
      }),
  }
}
