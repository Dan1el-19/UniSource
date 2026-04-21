import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getServiceDetails, listAuditEvents } from '../db/services';
import type {
  ServiceDetailResponse,
  ServiceUsageResponse,
  AuditLogListResponse,
} from '@unisource/sdk';

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

admin.get('/service', async (c) => {
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.usrc_d1, serviceId);
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

admin.get('/service/usage', async (c) => {
  const serviceId = c.get('serviceId');
  const service = await getServiceDetails(c.env.usrc_d1, serviceId);
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
    .enum(['upload_completed', 'file_deleted', 'folder_deleted', 'quota_exceeded'])
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
      const result = await listAuditEvents(c.env.usrc_d1, serviceId, {
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

export default admin;
