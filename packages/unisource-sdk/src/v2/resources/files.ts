import type { BulkFileIds, BulkFileMoveRequest, BulkOperationResponse } from '../legacy-draft'
import { bulkOperationResponseSchema } from '../legacy-draft'
import type { V2File } from '../files'
import type { V2ListQuery, V2ListResponse } from '../types'
import { v2FilesListResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

export function createFilesResource(request: V2Request) {
  return {
    list: (
      query?: V2ListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ListResponse<V2File>> =>
      request('GET', '/v2/files', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2FilesListResponseSchema,
      }),
    bulkTrash: (
      body: BulkFileIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/files/bulk-trash', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
    bulkRestore: (
      body: BulkFileIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/files/bulk-restore', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
    bulkMove: (
      body: BulkFileMoveRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/files/bulk-move', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
  }
}
