import type { V2Request } from '../transport'
import {
  v2ReleaseUploadInitRequestSchema,
  v2ReleaseUploadInitResponseSchema,
  v2ReleaseUploadCompleteRequestSchema,
  v2ReleaseLifecycleResponseSchema,
  v2ReleaseMultipartCreateRequestSchema,
  v2ReleaseMultipartCreateResponseSchema,
  v2ReleaseMultipartSignPartQuerySchema,
  v2ReleaseMultipartSignPartResponseSchema,
  v2ReleaseMultipartListPartsResponseSchema,
  v2ReleaseMultipartCompleteRequestSchema,
  v2ReleaseMultipartAbortRequestSchema,
  v2ReleaseListResponseSchema,
  v2ReleaseResourceResponseSchema,
  v2ReleaseUpdateRequestSchema,
  v2ReleaseDeleteResponseSchema,
  v2ReleaseSyncRequestSchema,
  v2ReleaseSyncResponseSchema,
  type V2ReleaseUploadInitRequest,
  type V2ReleaseUploadInitResponse,
  type V2ReleaseLifecycleResponse,
  type V2ReleaseMultipartCreateRequest,
  type V2ReleaseMultipartCreateResponse,
  type V2ReleaseMultipartSignPartResponse,
  type V2ReleaseMultipartListPartsResponse,
  type V2ReleaseListQuery,
  type V2ReleaseListResponse,
  type V2ReleaseResourceResponse,
  type V2ReleaseUpdateRequest,
  type V2ReleaseDeleteResponse,
  type V2ReleaseSyncRequest,
  type V2ReleaseSyncResponse,
} from '../release-schemas'

interface CallOptions {
  asUser?: string
}

export function createReleasesResource(request: V2Request) {
  return {
    uploadInit: (
      body: V2ReleaseUploadInitRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseUploadInitResponse> =>
      request('POST', '/v2/releases/upload/init', {
        body: v2ReleaseUploadInitRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseUploadInitResponseSchema,
      }),

    uploadComplete: (
      releaseId: string,
      size: number,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseLifecycleResponse> =>
      request('POST', '/v2/releases/upload/complete', {
        body: v2ReleaseUploadCompleteRequestSchema.parse({ release_id: releaseId, size }),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseLifecycleResponseSchema,
      }),

    uploadFail: (
      releaseId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseLifecycleResponse> =>
      request('POST', '/v2/releases/upload/fail', {
        body: { release_id: releaseId },
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseLifecycleResponseSchema,
      }),

    multipartCreate: (
      body: V2ReleaseMultipartCreateRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseMultipartCreateResponse> =>
      request('POST', '/v2/releases/upload/multipart/create', {
        body: v2ReleaseMultipartCreateRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseMultipartCreateResponseSchema,
      }),

    multipartSignPart: (
      uploadId: string,
      partNumber: number,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseMultipartSignPartResponse> =>
      request('GET', '/v2/releases/upload/multipart/sign-part', {
        query: v2ReleaseMultipartSignPartQuerySchema.parse({
          upload_id: uploadId,
          part_number: partNumber,
        }),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseMultipartSignPartResponseSchema,
      }),

    multipartListParts: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseMultipartListPartsResponse> =>
      request('GET', '/v2/releases/upload/multipart/list-parts', {
        query: { upload_id: uploadId },
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseMultipartListPartsResponseSchema,
      }),

    multipartComplete: (
      uploadId: string,
      parts: Array<{ PartNumber: number; ETag: string }>,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseLifecycleResponse> =>
      request('POST', '/v2/releases/upload/multipart/complete', {
        body: v2ReleaseMultipartCompleteRequestSchema.parse({ upload_id: uploadId, parts }),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseLifecycleResponseSchema,
      }),

    multipartAbort: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseLifecycleResponse> =>
      request('DELETE', '/v2/releases/upload/multipart/abort', {
        body: v2ReleaseMultipartAbortRequestSchema.parse({ upload_id: uploadId }),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseLifecycleResponseSchema,
      }),

    list: (
      query?: V2ReleaseListQuery,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseListResponse> =>
      request('GET', '/v2/releases', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseListResponseSchema,
      }),

    latest: (
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseResourceResponse> =>
      request('GET', '/v2/releases/latest', {
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseResourceResponseSchema,
      }),

    get: (
      id: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseResourceResponse> =>
      request('GET', `/v2/releases/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseResourceResponseSchema,
      }),

    update: (
      id: string,
      body: V2ReleaseUpdateRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseResourceResponse> =>
      request('PATCH', `/v2/releases/${encodeURIComponent(id)}`, {
        body: v2ReleaseUpdateRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseResourceResponseSchema,
      }),

    delete: (
      id: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseDeleteResponse> =>
      request('DELETE', `/v2/releases/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseDeleteResponseSchema,
      }),

    sync: (
      body: V2ReleaseSyncRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2ReleaseSyncResponse> =>
      request('POST', '/v2/releases/sync', {
        body: v2ReleaseSyncRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2ReleaseSyncResponseSchema,
      }),
  }
}
