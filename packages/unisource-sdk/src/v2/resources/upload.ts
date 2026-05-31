import type { V2Request } from '../transport'
import {
  v2UploadR2InitRequestSchema,
  v2UploadR2InitResponseSchema,
  v2UploadAppwriteInitRequestSchema,
  v2UploadAppwriteInitResponseSchema,
  v2UploadCompleteRequestSchema,
  v2UploadLifecycleResponseSchema,
  v2MultipartCreateRequestSchema,
  v2MultipartCreateResponseSchema,
  v2MultipartSignPartQuerySchema,
  v2MultipartSignPartResponseSchema,
  v2MultipartListPartsResponseSchema,
  v2MultipartCompleteRequestSchema,
  v2MultipartAbortRequestSchema,
  type V2UploadR2InitRequest,
  type V2UploadR2InitResponse,
  type V2UploadAppwriteInitRequest,
  type V2UploadAppwriteInitResponse,
  type V2UploadLifecycleResponse,
  type V2MultipartCreateRequest,
  type V2MultipartCreateResponse,
  type V2MultipartSignPartResponse,
  type V2MultipartListPartsResponse,
} from '../upload-schemas'

interface CallOptions {
  asUser?: string
}

export function createUploadResource(request: V2Request) {
  return {
    r2Init: (
      body: V2UploadR2InitRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadR2InitResponse> =>
      request('POST', '/v2/upload/r2/init', {
        body: v2UploadR2InitRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2UploadR2InitResponseSchema,
      }),

    appwriteInit: (
      body: V2UploadAppwriteInitRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadAppwriteInitResponse> =>
      request('POST', '/v2/upload/appwrite/init', {
        body: v2UploadAppwriteInitRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2UploadAppwriteInitResponseSchema,
      }),

    complete: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions & { isMainStorage?: boolean }
    ): Promise<V2UploadLifecycleResponse> =>
      request('POST', '/v2/upload/complete', {
        body: v2UploadCompleteRequestSchema.parse({
          upload_id: uploadId,
          ...(options?.isMainStorage ? { is_main_storage: true } : {}),
        }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),

    multipartCreate: (
      body: V2MultipartCreateRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartCreateResponse> =>
      request('POST', '/v2/upload/r2/multipart/create', {
        body: v2MultipartCreateRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2MultipartCreateResponseSchema,
      }),

    multipartSignPart: (
      uploadId: string,
      partNumber: number,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartSignPartResponse> =>
      request('GET', '/v2/upload/r2/multipart/sign-part', {
        query: v2MultipartSignPartQuerySchema.parse({
          upload_id: uploadId,
          part_number: partNumber,
        }),
        signal,
        asUser: options?.asUser,
        parser: v2MultipartSignPartResponseSchema,
      }),

    multipartListParts: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartListPartsResponse> =>
      request('GET', '/v2/upload/r2/multipart/list-parts', {
        query: { upload_id: uploadId },
        signal,
        asUser: options?.asUser,
        parser: v2MultipartListPartsResponseSchema,
      }),

    multipartComplete: (
      uploadId: string,
      parts: Array<{ PartNumber: number; ETag: string }>,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadLifecycleResponse> =>
      request('POST', '/v2/upload/r2/multipart/complete', {
        body: v2MultipartCompleteRequestSchema.parse({ upload_id: uploadId, parts }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),

    multipartAbort: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadLifecycleResponse> =>
      request('DELETE', '/v2/upload/r2/multipart/abort', {
        body: v2MultipartAbortRequestSchema.parse({ upload_id: uploadId }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),
  }
}
