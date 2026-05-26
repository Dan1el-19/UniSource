import type {
  BulkFolderIds,
  BulkFolderMoveRequest,
  BulkOperationResponse,
} from '../legacy-draft'
import { bulkOperationResponseSchema } from '../legacy-draft'
import type {
  V2FolderBreadcrumbsResponse,
  V2FolderListQuery,
  V2FolderListResponse,
} from '../folders'
import { v2FolderBreadcrumbsResponseSchema, v2FolderListResponseSchema } from '../folders'
import type { V2Request } from '../transport'

export function createFoldersResource(request: V2Request) {
  return {
    list: (
      query?: V2FolderListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderListResponse> =>
      request('GET', '/v2/folders', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2FolderListResponseSchema,
      }),
    breadcrumbs: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderBreadcrumbsResponse> =>
      request('GET', `/v2/folders/${encodeURIComponent(id)}/breadcrumbs`, {
        signal,
        asUser: options?.asUser,
        parser: v2FolderBreadcrumbsResponseSchema,
      }),
    bulkTrash: (
      body: BulkFolderIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/folders/bulk-trash', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
    bulkRestore: (
      body: BulkFolderIds,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/folders/bulk-restore', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
    bulkMove: (
      body: BulkFolderMoveRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<BulkOperationResponse> =>
      request('POST', '/v2/folders/bulk-move', {
        body,
        signal,
        asUser: options?.asUser,
        parser: bulkOperationResponseSchema,
      }),
  }
}
