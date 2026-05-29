import type {
  V2MyFilesListQuery,
  V2MyFilesListResponse,
  V2MyFilesMoveRequest,
  V2MyFilesMoveResponse,
  V2MyFilesTrashListQuery,
} from '../my-files-schemas'
import {
  v2MyFilesListResponseSchema,
  v2MyFilesMoveResponseSchema,
} from '../my-files-schemas'
import type { V2Request } from '../transport'

/**
 * `client.myFiles` — per-user file records mounted at `/my-files`.
 *
 * Distinct from `client.userFiles` (which targets `/files/:id` — Plan 2 contract).
 * Distinct from `client.files` (V2 sub-API at `/v2/files`).
 */
export function createMyFilesResource(request: V2Request) {
  return {
    /**
     * List the calling user's files.
     * GET /my-files → { items, page }
     */
    list: (
      query?: V2MyFilesListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2MyFilesListResponse> =>
      request('GET', '/my-files', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2MyFilesListResponseSchema,
      }),

    /**
     * List the calling user's trashed files.
     * GET /my-files/trash → { items, page }
     */
    listTrash: (
      query?: V2MyFilesTrashListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2MyFilesListResponse> =>
      request('GET', '/my-files/trash', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2MyFilesListResponseSchema,
      }),

    /**
     * Move a file to a target folder (or root, by passing `folder_id: null`).
     * PATCH /my-files/:id/move → { item }
     */
    move: (
      id: string,
      body: V2MyFilesMoveRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2MyFilesMoveResponse> =>
      request('PATCH', `/my-files/${encodeURIComponent(id)}/move`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2MyFilesMoveResponseSchema,
      }),
  }
}
