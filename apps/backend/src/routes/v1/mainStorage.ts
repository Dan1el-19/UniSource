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
} from '../../db/v1/fileRecords';
import { releaseMainStorageQuota } from '../../db/v1/services';
import { deactivateShareLinksForFile } from '../../db/v1/shareLinks';
import {
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../../services/appwrite';
import { deleteObject } from '../../services/r2';
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from '@unisource/sdk';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';
import { listOrLegacy, itemOrLegacy, actionOrLegacy } from '../../lib/v2/responses';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const mainStorage = new Hono<HonoEnv>();


const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).default(FILES_DEFAULT_LIMIT),
  cursor: z.string().optional(),
});

type MainStorageFileResponse = Omit<FileRecord, 'storage_key' | 'bucket' | 'is_main_storage' | 'is_trashed'> & {
  is_trashed: boolean;
};


function toMainStorageFileResponse(file: FileRecord): MainStorageFileResponse {
  const { storage_key: _storageKey, bucket: _bucket, is_main_storage: _isMainStorage, ...publicFile } = file;
  return {
    ...publicFile,
    is_trashed: file.is_trashed === 1,
  };
}

// List all MAIN_STORAGE files for the service
mainStorage.get('/', zValidator('query', listQuerySchema, v2ValidationHook), async (c) => {
  const { limit, cursor } = c.req.valid('query');
  const serviceId = c.get('serviceId');
  const start = Date.now();
  try {
    const result = await listMainStorageFileRecords(c.env.APP_DB, serviceId, { limit, cursor });
    const response = c.json(listOrLegacy(c, result.items.map(toMainStorageFileResponse), {
      limit: limit,
      next_cursor: result.next_cursor,
    }));
    logV2Request(c, start, { route_family: 'mainStorage', operation: 'list' });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid cursor') {
      throw new V2Error('cursor_invalid', 400);
    }

    throw error;
  }
});

// Get a single MAIN_STORAGE file
mainStorage.get('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1) {
    throw new V2Error('not_found', 404, 'File not found or not part of main storage');
  }
  const mapped = toMainStorageFileResponse(file);
  const response = c.json(itemOrLegacy(c, mapped, mapped));
  logV2Request(c, start, { route_family: 'mainStorage', operation: 'get' });
  return response;
});

const fileUpdateBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
});

// Rename a MAIN_STORAGE file
mainStorage.patch(
  '/:id',
  zValidator('json', fileUpdateBodySchema, v2ValidationHook),
  async (c) => {
    const serviceId = c.get('serviceId');
    const start = Date.now();
    const { filename } = c.req.valid('json');
    const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
    if (!file || file.service_id !== serviceId || file.is_main_storage !== 1 || file.is_trashed === 1) {
      throw new V2Error('not_found', 404, 'File not found or not part of main storage');
    }
    const updated = await updateFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId, { filename });
    if (!updated) {
      throw new V2Error('not_found', 404, 'File not found or not part of main storage');
    }
    const mapped = toMainStorageFileResponse(updated);
    const response = c.json(itemOrLegacy(c, mapped, { file: mapped }));
    logV2Request(c, start, { route_family: 'mainStorage', operation: 'update' });
    return response;
  }
);

// Soft-delete or permanent delete a MAIN_STORAGE file
mainStorage.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const permanent = c.req.query('permanent') === 'true';
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1) {
    throw new V2Error('not_found', 404, 'File not found or not part of main storage');
  }
  if (permanent) {
    try {
      if (file.storage_destination === 'r2') {
        await deleteObject(c.env, file.bucket, file.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(file.storage_key);
        if (!appwriteFileId) {
          throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format');
        }
        await deleteAppwriteFile(c.env, file.bucket, appwriteFileId);
      }
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to delete file in upstream storage');
    }

    await deleteFileRecordPermanently(c.env.APP_DB, file.id, file.user_id, serviceId);
    await releaseMainStorageQuota(c.env.APP_DB, serviceId, file.size);
    await deactivateShareLinksForFile(c.env.APP_DB, file.id, serviceId);
  } else {
    await trashFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  }
  const response = c.json(actionOrLegacy(c,
    { file_id: file.id, deleted: true },
    { success: true, file_id: file.id }
  ));
  logV2Request(c, start, { route_family: 'mainStorage', operation: 'delete' });
  return response;
});

// Restore a trashed MAIN_STORAGE file
mainStorage.post('/:id/restore', async (c) => {
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const file = await getFileRecord(c.env.APP_DB, c.req.param('id'));
  if (!file || file.service_id !== serviceId || file.is_main_storage !== 1 || file.is_trashed !== 1) {
    throw new V2Error('not_found', 404, 'File not found or not part of main storage');
  }
  await restoreFileRecord(c.env.APP_DB, file.id, file.user_id, serviceId);
  const response = c.json(actionOrLegacy(c,
    { file_id: file.id, restored: true },
    { success: true, file_id: file.id }
  ));
  logV2Request(c, start, { route_family: 'mainStorage', operation: 'restore' });
  return response;
});

export default mainStorage;
