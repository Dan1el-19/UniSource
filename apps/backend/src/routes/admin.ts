import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ensureServiceUser,
  getServiceDetails,
  getServiceUser,
  getUserStorageUsage,
  listAuditEvents,
  listServiceUsersByService,
  listUserStorageUsageByService,
  reconcileQuota,
  logServiceEvent,
  updateServiceDetails,
  updateServiceSettings,
  upsertServiceUserSettings,
} from '../db/services';
import {
  getAppwriteUser,
  listAppwriteUsers,
  updateAppwriteUserEmail,
  updateAppwriteUserLabels,
  updateAppwriteUserName,
  updateAppwriteUserPassword,
  updateAppwriteUserStatus,
} from '../services/appwrite';
import type { AdminUser } from '@unisource/sdk';
import { adminServiceSettingsRequestSchema } from '@unisource/sdk';
import { DEFAULT_SERVICE_ID } from '../config/services';
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';
import { listOrLegacy, itemOrLegacy, actionOrLegacy } from '../lib/v2/responses';
import { wantsV2 } from '../lib/v2/negotiation';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const AUDIT_DEFAULT_LIMIT = 25;

const admin = new Hono<HonoEnv>();

function parseLabels(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return [...new Set(value.map((label) => label.trim()).filter(Boolean))];
}

function syncRoleLabels(labels: string[], role: string | undefined): string[] {
  if (role === undefined) return labels;
  const filtered = labels.filter((l) => l !== 'admin' && l !== 'plus');
  if (role === 'admin') return [...filtered, 'admin'];
  if (role === 'plus') return [...filtered, 'plus'];
  return filtered;
}

function mapAdminUser(
  user: Awaited<ReturnType<typeof getAppwriteUser>>,
  service: NonNullable<Awaited<ReturnType<typeof getServiceDetails>>>,
  usageMap: Record<string, number>,
  metadata?: {
    role?: string;
    max_storage_bytes?: number | null;
  } | null
): AdminUser {
  const currentUsedBytes = usageMap[user.$id] ?? 0;
  const role = metadata?.role ?? (user.labels.includes('admin') ? 'admin' : 'user');
  const maxStorageBytes = metadata?.max_storage_bytes ?? null;

  return {
    id: user.$id,
    name: user.name,
    email: user.email,
    status: user.status,
    labels: user.labels,
    role,
    has_service_access: service.id === DEFAULT_SERVICE_ID ? true : metadata !== null && metadata !== undefined,
    max_storage_bytes: maxStorageBytes,
    effective_max_storage_bytes: maxStorageBytes ?? service.max_storage_bytes,
    current_used_bytes: currentUsedBytes,
    registration: Math.floor(new Date(user.registration).getTime() / 1000),
    email_verification: user.emailVerification,
  };
}

admin.get('/service', async (c) => {
  const start = Date.now();
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);
  if (!service) {
    throw new V2Error('not_found', 404, 'Service not found');
  }

  const serviceData = {
    id: service.id,
    name: service.name,
    max_storage_bytes: service.max_storage_bytes,
    current_used_bytes: service.current_used_bytes,
    max_file_size_bytes: service.max_file_size_bytes,
    recommended_upload_destination: service.recommended_upload_destination,
    created_at: service.created_at,
  };
  const response = c.json(itemOrLegacy(c, serviceData, { service: serviceData }));
  logV2Request(c, start, { route_family: 'admin', operation: 'get_service' });
  return response;
});

const serviceUpdateSchema = z.object({
  max_storage_bytes: z.number().int().positive(),
  max_file_size_bytes: z.number().int().positive(),
});

admin.patch(
  '/service',
  zValidator('json', serviceUpdateSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const body = c.req.valid('json');
    const service = await updateServiceDetails(c.env.APP_DB, serviceId, body);

    if (!service) {
      throw new V2Error('not_found', 404, 'Service not found');
    }

    const serviceData = {
      id: service.id,
      name: service.name,
      max_storage_bytes: service.max_storage_bytes,
      current_used_bytes: service.current_used_bytes,
      max_file_size_bytes: service.max_file_size_bytes,
      recommended_upload_destination: service.recommended_upload_destination,
      created_at: service.created_at,
    };
    const response = c.json(itemOrLegacy(c, serviceData, { service: serviceData }));
    logV2Request(c, start, { route_family: 'admin', operation: 'update_service' });
    return response;
  }
);

/**
 * Admin-only: change per-service UI settings (e.g. recommended upload
 * destination for the split-button upload widget). Kept separate from the
 * quota/size update endpoint so UX changes don't require re-sending quota.
 */
admin.patch(
  '/service/settings',
  zValidator('json', adminServiceSettingsRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const body = c.req.valid('json');

    const service = await updateServiceSettings(c.env.APP_DB, serviceId, {
      recommended_upload_destination: body.recommended_upload_destination,
    });

    if (!service) {
      throw new V2Error('not_found', 404, 'Service not found');
    }

    const serviceData = {
      id: service.id,
      name: service.name,
      max_storage_bytes: service.max_storage_bytes,
      current_used_bytes: service.current_used_bytes,
      max_file_size_bytes: service.max_file_size_bytes,
      recommended_upload_destination: service.recommended_upload_destination,
      created_at: service.created_at,
    };
    const response = c.json(itemOrLegacy(c, serviceData, { service: serviceData }));
    logV2Request(c, start, { route_family: 'admin', operation: 'update_settings' });
    return response;
  }
);

admin.get('/service/usage', async (c) => {
  const start = Date.now();
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);
  if (!service) {
    throw new V2Error('not_found', 404, 'Service not found');
  }

  const used_percent =
    service.max_storage_bytes > 0
      ? Math.round((service.current_used_bytes / service.max_storage_bytes) * 10000) / 100
      : 0;

  const data = {
    service_id: serviceId,
    max_storage_bytes: service.max_storage_bytes,
    current_used_bytes: service.current_used_bytes,
    used_percent,
  };
  const response = c.json(itemOrLegacy(c, data, data));
  logV2Request(c, start, { route_family: 'admin', operation: 'get_usage' });
  return response;
});

const auditLogQuerySchema = z.object({
  user_id: z.string().optional(),
  action: z
    .enum(['upload_completed', 'file_deleted', 'folder_deleted', 'quota_exceeded', 'share_link_accessed'])
    .optional(),
  resource_type: z.enum(['file', 'folder', 'service']).optional(),
  cursor: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : AUDIT_DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(200)),
});

admin.get(
  '/audit-log',
  zValidator('query', auditLogQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const query = c.req.valid('query');

    try {
      const result = await listAuditEvents(c.env.APP_DB, serviceId, {
        user_id: query.user_id,
        action: query.action,
        resource_type: query.resource_type,
        cursor: query.cursor,
        limit: query.limit,
      });

      const response = c.json(listOrLegacy(c, result.items, {
        limit: query.limit,
        next_cursor: result.next_cursor,
      }));
      logV2Request(c, start, { route_family: 'admin', operation: 'list_audit_log' });
      return response;
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid cursor') {
        throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
      }
      throw err;
    }
  }
);

const userListQuerySchema = z.object({
  search: z.string().trim().max(256).optional(),
  offset: z
    .string()
    .optional()
    .transform((value) => (value !== undefined ? Number(value) : 0))
    .pipe(z.number().int().min(0).max(10_000)),
  limit: z
    .string()
    .optional()
    .transform((value) => (value !== undefined ? Number(value) : 25))
    .pipe(z.number().int().min(1).max(100)),
});

admin.get('/users', zValidator('query', userListQuerySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);

  if (!service) {
    throw new V2Error('not_found', 404, 'Service not found');
  }

  const [appwriteUsers, serviceUsers, usageMap] = await Promise.all([
    listAppwriteUsers(c.env, {
      search: query.search,
      limit: query.limit,
      offset: query.offset,
    }),
    listServiceUsersByService(c.env.APP_DB, serviceId),
    listUserStorageUsageByService(c.env.APP_DB, serviceId),
  ]);

  const metadataByUserId = new Map(serviceUsers.map((item) => [item.user_id, item]));

  const users = appwriteUsers.users.map((user) =>
    mapAdminUser(user, service, usageMap, metadataByUserId.get(user.$id) ?? null)
  );
  const response = c.json(wantsV2(c)
    ? { items: users, page: { limit: query.limit, next_cursor: null }, total: appwriteUsers.total, offset: query.offset }
    : { items: users, total: appwriteUsers.total, offset: query.offset, limit: query.limit }
  );
  logV2Request(c, start, { route_family: 'admin', operation: 'list_users' });
  return response;
});

const userIdParamSchema = z.object({
  userId: z.string().trim().min(1),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().email().optional(),
  status: z.boolean().optional(),
  labels: z.array(z.string().trim().min(1)).max(32).optional(),
  role: z.string().trim().min(1).max(64).optional(),
  max_storage_bytes: z.number().int().positive().nullable().optional(),
});

admin.patch(
  '/users/:userId',
  zValidator('param', userIdParamSchema, v2ValidationHook),
  zValidator('json', userUpdateSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const { userId } = c.req.valid('param');
    const body = c.req.valid('json');
    const service = await getServiceDetails(c.env.APP_DB, serviceId);

    if (!service) {
      throw new V2Error('not_found', 404, 'Service not found');
    }

    let user = await getAppwriteUser(c.env, userId);

    if (body.name !== undefined && body.name !== user.name) {
      user = await updateAppwriteUserName(c.env, userId, body.name);
    }

    if (body.email !== undefined && body.email !== user.email) {
      user = await updateAppwriteUserEmail(c.env, userId, body.email);
    }

    if (body.status !== undefined && body.status !== user.status) {
      user = await updateAppwriteUserStatus(c.env, userId, body.status);
    }

    const normalizedLabels = parseLabels(body.labels);
    if (normalizedLabels || body.role !== undefined) {
      const syncedLabels = syncRoleLabels(normalizedLabels ?? user.labels, body.role);
      user = await updateAppwriteUserLabels(c.env, userId, syncedLabels);
    }

    if (body.role !== undefined || body.max_storage_bytes !== undefined) {
      const currentSettings = await getServiceUser(c.env.APP_DB, serviceId, userId);
      await upsertServiceUserSettings(c.env.APP_DB, {
        serviceId,
        userId,
        role: body.role ?? currentSettings?.role ?? (user.labels.includes('admin') ? 'admin' : 'user'),
        max_storage_bytes: body.max_storage_bytes ?? currentSettings?.max_storage_bytes ?? null,
      });
    } else if (serviceId !== DEFAULT_SERVICE_ID) {
      await ensureServiceUser(c.env.APP_DB, serviceId, userId, user.labels.includes('admin') ? 'admin' : 'user');
    }

    const [metadata, currentUsedBytes] = await Promise.all([
      getServiceUser(c.env.APP_DB, serviceId, userId),
      getUserStorageUsage(c.env.APP_DB, serviceId, userId),
    ]);

    const mapped = mapAdminUser(user, service, { [userId]: currentUsedBytes }, metadata);
    const response = c.json(itemOrLegacy(c, mapped, { user: mapped }));
    logV2Request(c, start, { route_family: 'admin', operation: 'update_user' });
    return response;
  }
);

const userPasswordSchema = z.object({
  password: z.string().min(8).max(256),
});

admin.post(
  '/users/:userId/password',
  zValidator('param', userIdParamSchema, v2ValidationHook),
  zValidator('json', userPasswordSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { userId } = c.req.valid('param');
    const { password } = c.req.valid('json');

    await updateAppwriteUserPassword(c.env, userId, password);

    const response = c.json(actionOrLegacy(c,
      { user_id: userId, password_reset: true },
      { success: true, user_id: userId }
    ));
    logV2Request(c, start, { route_family: 'admin', operation: 'reset_password' });
    return response;
  }
);

const roleUpdateSchema = z.object({
  role: z.enum(['user', 'plus', 'admin']),
});

admin.patch(
  '/users/:userId/role',
  zValidator('param', userIdParamSchema, v2ValidationHook),
  zValidator('json', roleUpdateSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const { userId } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const service = await getServiceDetails(c.env.APP_DB, serviceId);
    if (!service) throw new V2Error('not_found', 404, 'Service not found');

    let user = await getAppwriteUser(c.env, userId);
    const syncedLabels = syncRoleLabels(user.labels, role);
    if (syncedLabels.join(',') !== user.labels.join(',')) {
      user = await updateAppwriteUserLabels(c.env, userId, syncedLabels);
    }

    const currentSettings = await getServiceUser(c.env.APP_DB, serviceId, userId);
    await upsertServiceUserSettings(c.env.APP_DB, {
      serviceId,
      userId,
      role,
      max_storage_bytes: currentSettings?.max_storage_bytes ?? null,
    });

    const [metadata, currentUsedBytes] = await Promise.all([
      getServiceUser(c.env.APP_DB, serviceId, userId),
      getUserStorageUsage(c.env.APP_DB, serviceId, userId),
    ]);

    const mapped = mapAdminUser(user, service, { [userId]: currentUsedBytes }, metadata);
    const response = c.json(itemOrLegacy(c, mapped, { user: mapped }));
    logV2Request(c, start, { route_family: 'admin', operation: 'update_role' });
    return response;
  }
);

const storageLimitUpdateSchema = z.object({
  limit_bytes: z.number().int().positive().nullable(),
});

admin.patch(
  '/users/:userId/storage-limit',
  zValidator('param', userIdParamSchema, v2ValidationHook),
  zValidator('json', storageLimitUpdateSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const serviceId = c.get('serviceId');
    const { userId } = c.req.valid('param');
    const { limit_bytes } = c.req.valid('json');
    const service = await getServiceDetails(c.env.APP_DB, serviceId);
    if (!service) throw new V2Error('not_found', 404, 'Service not found');

    const user = await getAppwriteUser(c.env, userId);
    const currentSettings = await getServiceUser(c.env.APP_DB, serviceId, userId);
    await upsertServiceUserSettings(c.env.APP_DB, {
      serviceId,
      userId,
      role: currentSettings?.role ?? (user.labels.includes('admin') ? 'admin' : 'user'),
      max_storage_bytes: limit_bytes,
    });

    const [metadata, currentUsedBytes] = await Promise.all([
      getServiceUser(c.env.APP_DB, serviceId, userId),
      getUserStorageUsage(c.env.APP_DB, serviceId, userId),
    ]);

    const mapped = mapAdminUser(user, service, { [userId]: currentUsedBytes }, metadata);
    const response = c.json(itemOrLegacy(c, mapped, { user: mapped }));
    logV2Request(c, start, { route_family: 'admin', operation: 'update_storage_limit' });
    return response;
  }
);

admin.post('/quota/reconcile', async (c) => {
  const start = Date.now();
  const serviceId = c.get('serviceId');
  const dryRun = c.req.query('dry_run') === 'true';

  const result = await reconcileQuota(c.env.APP_DB, serviceId, dryRun);

  if (!dryRun && (result.service_drift_bytes !== 0 || result.users_fixed > 0)) {
    c.executionCtx.waitUntil(
      logServiceEvent(c.env.APP_DB, {
        serviceId,
        userId: c.get('userId'),
        action: 'quota_reconciled',
        resourceType: 'service',
        resourceId: serviceId,
        metadata: result,
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
      })
    );
  }

  const response = c.json(actionOrLegacy(c,
    result as unknown as Record<string, unknown>,
    result as unknown as Record<string, unknown>
  ));
  logV2Request(c, start, { route_family: 'admin', operation: 'reconcile_quota' });
  return response;
});

export default admin;
