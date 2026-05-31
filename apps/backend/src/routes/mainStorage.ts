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
  type FileRecord,
} from '../db/v1/fileRecords';
import { releaseMainStorageQuota } from '../db/v1/services';
import { deactivateShareLinksForFile } from '../db/v1/shareLinks';
import {
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import { deleteObject } from '../services/r2';
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const mainStorage = new Hono<HonoEnv>();

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

type MainStorageFileResponse = Omit<FileRecord, 'storage_key' | 'bucket' | 'is_main_storage' | 'is_trashed'> & {
  is_trashed: boolean;
};

const notFoundResponse = {
  error: 'Not Found',
  message: 'File not found or not part of main storage',
};

function toMainStorageFileResponse(file: FileRecord): MainStorageFileResponse {
  const { storage_key: _storageKey, bucket: _bucket, is_main_storage: _isMainStorage, ...publicFile } = file;
  return {
    ...publicFile,
    is_trashed: file.is_trashed === 1,
  };
}

// List all MAIN_STORAGE files for the service
mainStorage.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const { limit, cursor } = c.req.valid('query');
  const serviceId = c.get('serviceId');
  try {
    const result = await listMainStorageFileRecords(c.env.APP_DB, serviceId, { limit, cursor });
    return c.json({
      items: result.items.map(toMainStorageFileResponse),
      next_cursor: result.next_cursor,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid cursor') {
      return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
    }

    throw error;
  }
});

// Get a single MAIN_STORAGE file
mainStorage.get('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1) {
    return c.json(notFoundResponse, 404);
  }
  return c.json(toMainStorageFileResponse(file));
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
    if (!file || file.service_id !== serviceId || file.is_main_storage !== 1 || file.is_trashed === 1) {
      return c.json(notFoundResponse, 404);
    }
    const updated = await updateFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId, { filename });
    if (!updated) {
      return c.json(notFoundResponse, 404);
    }
    return c.json({ file: toMainStorageFileResponse(updated) });
  }
);

// Soft-delete or permanent delete a MAIN_STORAGE file
mainStorage.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const permanent = c.req.query('permanent') === 'true';
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1) {
    return c.json(notFoundResponse, 404);
  }
  if (permanent) {
    try {
      if (file.storage_destination === 'r2') {
        await deleteObject(c.env, file.bucket, file.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(file.storage_key);
        if (!appwriteFileId) {
          return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key format' }, 500);
        }
        await deleteAppwriteFile(c.env, file.bucket, appwriteFileId);
      }
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to delete file in upstream storage' }, 502);
    }

    await deleteFileRecordPermanently(c.env.APP_DB, file.id, file.user_id, serviceId);
    await releaseMainStorageQuota(c.env.APP_DB, serviceId, file.size);
    await deactivateShareLinksForFile(c.env.APP_DB, file.id, serviceId);
  } else {
    await trashFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  }
  return c.json({ success: true, file_id: file.id });
});

// Restore a trashed MAIN_STORAGE file
mainStorage.post('/:id/restore', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1 || file.is_trashed !== 1) {
    return c.json(notFoundResponse, 404);
  }
  await restoreFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  return c.json({ success: true, file_id: file.id });
});

export default mainStorage;
