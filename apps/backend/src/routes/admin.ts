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
import type {
  ServiceDetailResponse,
  ServiceUsageResponse,
  AuditLogListResponse,
  AdminServiceUpdateRequest,
  AdminServiceUpdateResponse,
  AdminUser,
  AdminUserListResponse,
  AdminUserPasswordResetResponse,
  AdminUserUpdateResponse,
} from '@unisource/sdk';
import { DEFAULT_SERVICE_ID } from '../config/services';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const AUDIT_DEFAULT_LIMIT = 25;

function validationErrorHook(
  result: {
    success: boolean;
    error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> };
  },
  c: { json: (value: unknown, status?: number) => Response }
) {
  if (result.success) return;
  const firstIssue = result.error?.issues[0];
  const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : '';
  return c.json(
    { error: 'Bad Request', message: `${issuePath}${firstIssue?.message ?? 'Validation failed'}` },
    400
  );
}

const admin = new Hono<HonoEnv>();

function parseLabels(value: string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return [...new Set(value.map((label) => label.trim()).filter(Boolean))];
}

function syncAdminLabel(labels: string[], role: string | undefined): string[] {
  if (role === 'admin') {
    return labels.includes('admin') ? labels : [...labels, 'admin'];
  }

  if (role && role !== 'admin') {
    return labels.filter((label) => label !== 'admin');
  }

  return labels;
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
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);
  if (!service) {
    return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
  }

  return c.json<ServiceDetailResponse>({
    service: {
      id: service.id,
      name: service.name,
      max_storage_bytes: service.max_storage_bytes,
      current_used_bytes: service.current_used_bytes,
      max_file_size_bytes: service.max_file_size_bytes,
      created_at: service.created_at,
    },
  });
});

const serviceUpdateSchema = z.object({
  max_storage_bytes: z.number().int().positive(),
  max_file_size_bytes: z.number().int().positive(),
});

admin.patch(
  '/service',
  zValidator('json', serviceUpdateSchema, validationErrorHook),
  async (c) => {
    const serviceId = c.get('serviceId');
    const body = c.req.valid('json');
    const service = await updateServiceDetails(c.env.APP_DB, serviceId, body);

    if (!service) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    return c.json<AdminServiceUpdateResponse>({
      service: {
        id: service.id,
        name: service.name,
        max_storage_bytes: service.max_storage_bytes,
        current_used_bytes: service.current_used_bytes,
        max_file_size_bytes: service.max_file_size_bytes,
        created_at: service.created_at,
      },
    });
  }
);

admin.get('/service/usage', async (c) => {
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);
  if (!service) {
    return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
  }

  const used_percent =
    service.max_storage_bytes > 0
      ? Math.round((service.current_used_bytes / service.max_storage_bytes) * 10000) / 100
      : 0;

  return c.json<ServiceUsageResponse>({
    service_id: serviceId,
    max_storage_bytes: service.max_storage_bytes,
    current_used_bytes: service.current_used_bytes,
    used_percent,
  });
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
  zValidator('query', auditLogQuerySchema, validationErrorHook),
  async (c) => {
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

      return c.json<AuditLogListResponse>({
        items: result.items,
        next_cursor: result.next_cursor,
        limit: query.limit,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'Invalid cursor') {
        return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
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

admin.get('/users', zValidator('query', userListQuerySchema, validationErrorHook), async (c) => {
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');
  const service = await getServiceDetails(c.env.APP_DB, serviceId);

  if (!service) {
    return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
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

  return c.json<AdminUserListResponse>({
    items: appwriteUsers.users.map((user) =>
      mapAdminUser(user, service, usageMap, metadataByUserId.get(user.$id) ?? null)
    ),
    total: appwriteUsers.total,
    offset: query.offset,
    limit: query.limit,
  });
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
  zValidator('param', userIdParamSchema, validationErrorHook),
  zValidator('json', userUpdateSchema, validationErrorHook),
  async (c) => {
    const serviceId = c.get('serviceId');
    const { userId } = c.req.valid('param');
    const body = c.req.valid('json');
    const service = await getServiceDetails(c.env.APP_DB, serviceId);

    if (!service) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
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
      const syncedLabels = syncAdminLabel(normalizedLabels ?? user.labels, body.role);
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

    return c.json<AdminUserUpdateResponse>({
      user: mapAdminUser(user, service, { [userId]: currentUsedBytes }, metadata),
    });
  }
);

const userPasswordSchema = z.object({
  password: z.string().min(8).max(256),
});

admin.post(
  '/users/:userId/password',
  zValidator('param', userIdParamSchema, validationErrorHook),
  zValidator('json', userPasswordSchema, validationErrorHook),
  async (c) => {
    const { userId } = c.req.valid('param');
    const { password } = c.req.valid('json');

    await updateAppwriteUserPassword(c.env, userId, password);

    return c.json<AdminUserPasswordResetResponse>({
      success: true,
      user_id: userId,
    });
  }
);

admin.post('/quota/reconcile', async (c) => {
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

  return c.json(result);
});

export default admin;
