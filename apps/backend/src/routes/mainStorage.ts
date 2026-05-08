import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  listMainStorageFileRecords,
  getFileRecord,
  updateFileRecord,
  trashFileRecord,
  restoreFileRecord,
  deleteFileRecordPermanently,
} from '../db/fileRecords';
import { requireRoleMiddleware } from '../middleware/requireRole';
import { releaseMainStorageQuota } from '../db/services';
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const mainStorage = new Hono<HonoEnv>();

mainStorage.use('*', requireRoleMiddleware(['plus', 'admin']));

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

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).default(FILES_DEFAULT_LIMIT),
  cursor: z.string().optional(),
});

// List all MAIN_STORAGE files for the service
mainStorage.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const { limit, cursor } = c.req.valid('query');
  const serviceId = c.get('serviceId');
  const result = await listMainStorageFileRecords(c.env.APP_DB, serviceId, { limit, cursor });
  return c.json(result);
});

// Get a single MAIN_STORAGE file
mainStorage.get('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage || file.is_trashed) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  return c.json(file);
});

const fileUpdateBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
});

// Rename a MAIN_STORAGE file
mainStorage.patch(
  '/:id',
  zValidator('json', fileUpdateBodySchema, validationErrorHook),
  async (c) => {
    const serviceId = c.get('serviceId');
    const { filename } = c.req.valid('json');
    const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
    if (!file || file.service_id !== serviceId || !file.is_main_storage || file.is_trashed) {
      return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
    }
    const updated = await updateFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId, { filename });
    return c.json(updated);
  }
);

// Soft-delete or permanent delete a MAIN_STORAGE file
mainStorage.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const permanent = c.req.query('permanent') === 'true';
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  if (permanent) {
    await deleteFileRecordPermanently(c.env.APP_DB, file.id, file.user_id, serviceId);
    await releaseMainStorageQuota(c.env.APP_DB, serviceId, file.size);
  } else {
    await trashFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  }
  return c.json({ success: true, file_id: file.id });
});

// Restore a trashed MAIN_STORAGE file
mainStorage.post('/:id/restore', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage || !file.is_trashed) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE trash' }, 404);
  }
  await restoreFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  return c.json({ success: true, file_id: file.id });
});

export default mainStorage;
