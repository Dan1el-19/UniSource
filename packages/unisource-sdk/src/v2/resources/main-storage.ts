import type {
  MainStorageDeleteResponse,
  MainStorageDetailResponse,
  MainStorageListQuery,
  MainStorageListResponse,
  MainStorageRenameRequest,
  MainStorageRenameResponse,
  MainStorageRestoreResponse,
} from '../../v1/mainStorage'
import {
  mainStorageDeleteResponseSchema,
  mainStorageDetailResponseSchema,
  mainStorageListResponseSchema,
  mainStorageRenameResponseSchema,
  mainStorageRestoreResponseSchema,
} from '../../v1/mainStorage'
import type { V2Request } from '../transport'

export function createMainStorageResource(request: V2Request) {
  return {
    list: (
      query?: MainStorageListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageListResponse> =>
      request('GET', '/main', {
        query,
        signal,
        asUser: options?.asUser,
        parser: mainStorageListResponseSchema,
      }),
    get: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageDetailResponse> =>
      request('GET', `/main/${encodeURIComponent(id)}`, {
        signal,
        asUser: options?.asUser,
        parser: mainStorageDetailResponseSchema,
      }),
    update: (
      id: string,
      body: MainStorageRenameRequest,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageRenameResponse> =>
      request('PATCH', `/main/${encodeURIComponent(id)}`, {
        body,
        signal,
        asUser: options?.asUser,
        parser: mainStorageRenameResponseSchema,
      }),
    delete: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string; permanent?: boolean }
    ): Promise<MainStorageDeleteResponse> =>
      request('DELETE', `/main/${encodeURIComponent(id)}`, {
        query: options?.permanent ? { permanent: true } : undefined,
        signal,
        asUser: options?.asUser,
        parser: mainStorageDeleteResponseSchema,
      }),
    restore: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<MainStorageRestoreResponse> =>
      request('POST', `/main/${encodeURIComponent(id)}/restore`, {
        signal,
        asUser: options?.asUser,
        parser: mainStorageRestoreResponseSchema,
      }),
  }
}
