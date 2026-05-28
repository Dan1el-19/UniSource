import {
  adminAuditLogListResponseSchema,
  adminPasswordResetResponseSchema,
  adminQuotaReconcileResponseSchema,
  adminServiceResponseSchema,
  adminServiceUsageResponseSchema,
  adminUserResponseSchema,
  adminUsersListResponseSchema,
  type AdminAuditLogListResponse,
  type AdminAuditLogQuery,
  type AdminPasswordResetResponse,
  type AdminQuotaReconcileRequest,
  type AdminQuotaReconcileResponse,
  type AdminServiceResponse,
  type AdminServiceSettingsUpdateRequest,
  type AdminServiceUpdateRequest,
  type AdminServiceUsageResponse,
  type AdminUserPasswordResetRequest,
  type AdminUserResponse,
  type AdminUserRoleUpdateRequest,
  type AdminUserStorageLimitUpdateRequest,
  type AdminUserUpdateRequest,
  type AdminUsersListQuery,
  type AdminUsersListResponse,
} from '../admin-schemas'
import type { V2Request } from '../transport'

export function createAdminResource(request: V2Request) {
  return {
    getService: (signal?: AbortSignal): Promise<AdminServiceResponse> =>
      request('GET', '/admin/service', {
        signal,
        parser: adminServiceResponseSchema,
      }),
    updateService: (
      body: AdminServiceUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminServiceResponse> =>
      request('PATCH', '/admin/service', {
        body,
        signal,
        parser: adminServiceResponseSchema,
      }),
    updateServiceSettings: (
      body: AdminServiceSettingsUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminServiceResponse> =>
      request('PATCH', '/admin/service/settings', {
        body,
        signal,
        parser: adminServiceResponseSchema,
      }),
    getServiceUsage: (signal?: AbortSignal): Promise<AdminServiceUsageResponse> =>
      request('GET', '/admin/service/usage', {
        signal,
        parser: adminServiceUsageResponseSchema,
      }),
    listAuditLog: (
      query?: AdminAuditLogQuery,
      signal?: AbortSignal
    ): Promise<AdminAuditLogListResponse> =>
      request('GET', '/admin/audit-log', {
        query,
        signal,
        parser: adminAuditLogListResponseSchema,
      }),
    listUsers: (
      query?: AdminUsersListQuery,
      signal?: AbortSignal
    ): Promise<AdminUsersListResponse> =>
      request('GET', '/admin/users', {
        query,
        signal,
        parser: adminUsersListResponseSchema,
      }),
    updateUser: (
      userId: string,
      body: AdminUserUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminUserResponse> =>
      request('PATCH', `/admin/users/${encodeURIComponent(userId)}`, {
        body,
        signal,
        parser: adminUserResponseSchema,
      }),
    resetUserPassword: (
      userId: string,
      body: AdminUserPasswordResetRequest,
      signal?: AbortSignal
    ): Promise<AdminPasswordResetResponse> =>
      request('POST', `/admin/users/${encodeURIComponent(userId)}/password`, {
        body,
        signal,
        parser: adminPasswordResetResponseSchema,
      }),
    updateUserRole: (
      userId: string,
      body: AdminUserRoleUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminUserResponse> =>
      request('PATCH', `/admin/users/${encodeURIComponent(userId)}/role`, {
        body,
        signal,
        parser: adminUserResponseSchema,
      }),
    updateUserStorageLimit: (
      userId: string,
      body: AdminUserStorageLimitUpdateRequest,
      signal?: AbortSignal
    ): Promise<AdminUserResponse> =>
      request('PATCH', `/admin/users/${encodeURIComponent(userId)}/storage-limit`, {
        body,
        signal,
        parser: adminUserResponseSchema,
      }),
    reconcileQuota: (
      args: AdminQuotaReconcileRequest = {},
      signal?: AbortSignal
    ): Promise<AdminQuotaReconcileResponse> =>
      request('POST', '/admin/quota/reconcile', {
        query: args.dryRun !== undefined ? { dry_run: args.dryRun } : undefined,
        signal,
        parser: adminQuotaReconcileResponseSchema,
      }),
  }
}
