import type { V2BulkResponse } from '../bulk-schemas'
import { v2BulkResponseSchema } from '../bulk-schemas'
import type { V2File } from '../files'
import type { V2ListQuery, V2ListResponse } from '../types'
import { v2FilesListResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

/**
 * Discriminated union for POST /v2/files/bulk body.
 * `move` requires explicit folder_id (null = root, but must be present).
 */
export type V2FilesBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; folder_id: string | null }
  | { action: 'delete'; ids: string[] }

export function createFilesResource(request: V2Request) {
  const bulk = (
    body: V2FilesBulkRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2BulkResponse> =>
    request('POST', '/v2/files/bulk', {
      body,
      signal,
      asUser: options?.asUser,
      parser: v2BulkResponseSchema,
    })

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

    /** Canonical bulk method — accepts a discriminated union body. */
    bulk,

    /** Convenience: delegates to bulk({ action: 'trash', ... }). */
    bulkTrash: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'trash', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'restore', ... }). */
    bulkRestore: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'restore', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'move', ... }). folder_id is required. */
    bulkMove: (
      args: { ids: string[]; folder_id: string | null },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'move', ids: args.ids, folder_id: args.folder_id }, signal, options),
  }
}
