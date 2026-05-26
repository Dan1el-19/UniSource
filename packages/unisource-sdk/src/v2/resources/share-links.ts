import type {
  ShareLinkCreateRequest,
  ShareLinkCreateResponse,
  ShareLinkDeleteResponse,
  ShareLinkListResponse,
  ShareLinkUpdateRequest,
  ShareLinkUpdateResponse,
} from '../../shareLinks'
import {
  shareLinkCreateResponseSchema,
  shareLinkDeleteResponseSchema,
  shareLinkListResponseSchema,
  shareLinkUpdateResponseSchema,
} from '../../shareLinks'
import type { V2Request } from '../transport'

export function createShareLinksResource(request: V2Request) {
  return {
    create: (
      fileId: string,
      body: ShareLinkCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkCreateResponse> =>
      request('POST', `/my-files/${encodeURIComponent(fileId)}/share-links`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: shareLinkCreateResponseSchema,
      }),
    listForFile: (
      fileId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkListResponse> =>
      request('GET', `/my-files/${encodeURIComponent(fileId)}/share-links`, {
        signal,
        asUser: options?.asUser,
        parser: shareLinkListResponseSchema,
      }),
    update: (
      linkId: string,
      body: ShareLinkUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkUpdateResponse> =>
      request('PATCH', `/share-links/${encodeURIComponent(linkId)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: shareLinkUpdateResponseSchema,
      }),
    delete: (
      linkId: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<ShareLinkDeleteResponse> =>
      request('DELETE', `/share-links/${encodeURIComponent(linkId)}`, {
        signal,
        asUser: options?.asUser,
        parser: shareLinkDeleteResponseSchema,
      }),
  }
}
