import type {
  V2FolderBreadcrumbsResponse,
  V2FolderCreateRequest,
  V2FolderDeleteResponse,
  V2FolderDetailResponse,
  V2FolderListQuery,
  V2FolderListResponse,
  V2FolderRestoreResponse,
  V2FolderUpdateRequest,
} from '../folders'
import {
  v2FolderBreadcrumbsResponseSchema,
  v2FolderDeleteResponseSchema,
  v2FolderDetailResponseSchema,
  v2FolderListResponseSchema,
  v2FolderRestoreResponseSchema,
} from '../folders'
import type { V2BulkResponse } from '../bulk-schemas'
import { v2BulkResponseSchema } from '../bulk-schemas'
import type { V2Request } from '../transport'

/**
 * Discriminated union for POST /v2/folders/bulk body.
 * `move` requires explicit parent_id (null = root, but must be present).
 */
export type V2FoldersBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; parent_id: string | null }
  | { action: 'delete'; ids: string[] }

export function createFoldersResource(request: V2Request) {
  const bulk = (
    body: V2FoldersBulkRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2BulkResponse> =>
    request('POST', '/v2/folders/bulk', {
      body,
      signal,
      asUser: options?.asUser,
      parser: v2BulkResponseSchema,
    })

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

    /** Convenience: delegates to bulk({ action: 'move', ... }). parent_id is required. */
    bulkMove: (
      args: { ids: string[]; parent_id: string | null },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'move', ids: args.ids, parent_id: args.parent_id }, signal, options),

    // ─── CRUD methods ─────────────────────────────────────────────────────────

    /**
     * Create a new folder.
     * POST /v2/folders → { item }
     */
    create: (
      body: V2FolderCreateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderDetailResponse> =>
      request('POST', '/v2/folders', {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2FolderDetailResponseSchema,
      }),

    /**
     * Fetch a single folder by id.
     * GET /v2/folders/:id → { item }
     */
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderDetailResponse> =>
      request('GET', `/v2/folders/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: v2FolderDetailResponseSchema,
      }),

    /**
     * Update a folder (rename / change color).
     * PATCH /v2/folders/:id → { item }
     */
    update: (
      id: string,
      body: V2FolderUpdateRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderDetailResponse> =>
      request('PATCH', `/v2/folders/${encodeURIComponent(id)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: v2FolderDetailResponseSchema,
      }),

    /**
     * Soft-delete (trash) a folder, or permanently delete the entire subtree.
     * DELETE /v2/folders/:id (?permanent=true)
     * - Soft: { success, id, permanent: false }
     * - Permanent: { success, id, permanent: true, folders_deleted }
     */
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<V2FolderDeleteResponse> =>
      request('DELETE', `/v2/folders/${encodeURIComponent(id)}`, {
        query: options?.permanent ? { permanent: true } : undefined,
        signal,
        asUser: options?.asUser,
        parser: v2FolderDeleteResponseSchema,
      }),

    /**
     * Restore a folder from trash.
     * POST /v2/folders/:id/restore → { success, id }
     */
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderRestoreResponse> =>
      request('POST', `/v2/folders/${encodeURIComponent(id)}/restore`, {
        signal,
        asUser: options?.asUser,
        parser: v2FolderRestoreResponseSchema,
      }),
  }
}
