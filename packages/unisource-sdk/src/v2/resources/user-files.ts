import type {
  FileDeleteResponse,
  FileDownloadUrlResponse,
  FileRecordDetailResponse,
  FileRestoreResponse,
  FileUpdateRequest,
  FileUpdateResponse,
} from '../../fileRecords'
import {
  fileDeleteResponseSchema,
  fileDownloadUrlResponseSchema,
  fileRecordDetailResponseSchema,
  fileRestoreResponseSchema,
  fileUpdateResponseSchema,
} from '../../fileRecords'
import type { V2Request } from '../transport'

export function createUserFilesResource(request: V2Request) {
  return {
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileRecordDetailResponse> =>
      request('GET', `/files/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: fileRecordDetailResponseSchema,
      }),
    update: (
      id: string,
      body: FileUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileUpdateResponse> =>
      request('PATCH', `/files/${encodeURIComponent(id)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: fileUpdateResponseSchema,
      }),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<FileDeleteResponse> =>
      request('DELETE', `/files/${encodeURIComponent(id)}`, {
        query: options?.permanent ? { permanent: true } : undefined,
        signal,
        asUser: options?.asUser,
        parser: fileDeleteResponseSchema,
      }),
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileRestoreResponse> =>
      request('POST', `/files/${encodeURIComponent(id)}/restore`, {
        signal,
        asUser: options?.asUser,
        parser: fileRestoreResponseSchema,
      }),
    downloadUrl: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<FileDownloadUrlResponse> =>
      request('GET', `/files/${encodeURIComponent(id)}/download-url`, {
        signal,
        asUser: options?.asUser,
        parser: fileDownloadUrlResponseSchema,
      }),
  }
}
