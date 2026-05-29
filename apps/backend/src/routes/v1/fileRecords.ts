import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  deleteFileRecordPermanently,
  getFileRecordForUser,
  listFileRecords,
  moveFileRecord,
  restoreFileRecord,
  trashFileRecord,
  updateFileRecord,
  type FileRecord,
} from '../../db/v1/fileRecords';
import { getFolderForUser } from '../../db/v1/folders';
import { logServiceEvent, releaseQuota } from '../../db/v1/services';
import { deleteObject, generatePresignedGetUrl } from '../../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../../services/appwrite';
import { deactivateShareLinksForFile } from '../../db/v1/shareLinks';
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT, fileMoveRequestSchema } from '@unisource/sdk';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';
import { listOrLegacy, itemOrLegacy, actionOrLegacy } from '../../lib/v2/responses';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

const fileIdParamSchema = z.object({ id: z.string().trim().min(1) });

const listQuerySchema = z
  .object({
    limit: z.string().optional(),
    cursor: z.string().optional(),
    folder_id: z.string().optional(),
  })
  .transform((v) => ({
    limit: v.limit !== undefined ? Number(v.limit) : FILES_DEFAULT_LIMIT,
    cursor: v.cursor?.trim() || undefined,
    folder_id: v.folder_id?.trim() || undefined,
  }))
  .superRefine((v, ctx) => {
    if (!Number.isInteger(v.limit) || v.limit < 1 || v.limit > FILES_MAX_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit'],
        message: `limit must be an integer between 1 and ${FILES_MAX_LIMIT}`,
      });
    }
  });

// Maps internal FileRecord to public response — intentionally excludes storage_key and bucket
function mapFileRecord(record: FileRecord): import('@unisource/sdk').FileRecord {
  return {
    id: record.id,
    service_id: record.service_id,
    user_id: record.user_id,
    folder_id: record.folder_id,
    upload_id: record.upload_id,
    filename: record.filename,
    size: record.size,
    mime_type: record.mime_type,
    storage_destination: record.storage_destination,
    // storage_key and bucket intentionally omitted from public response
    is_trashed: record.is_trashed === 1,
    trashed_at: record.trashed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

const myFiles = new Hono<HonoEnv>();

// List user's files — optionally filtered by folder
myFiles.get('/', zValidator('query', listQuerySchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');
  const start = Date.now();

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      folder_id: query.folder_id ?? null,
      trashed_only: false,
      limit: query.limit,
      cursor: query.cursor,
    });

    const response = c.json(listOrLegacy(c, result.items.map(mapFileRecord), {
      limit: query.limit,
      next_cursor: result.next_cursor,
    }));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'list' });
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
    }
    throw err;
  }
});

// List user's trash
myFiles.get('/trash', zValidator('query', listQuerySchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');
  const start = Date.now();

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      trashed_only: true,
      limit: query.limit,
      cursor: query.cursor,
    });

    const response = c.json(listOrLegacy(c, result.items.map(mapFileRecord), {
      limit: query.limit,
      next_cursor: result.next_cursor,
    }));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'list_trash' });
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
    }
    throw err;
  }
});

// Get single file
myFiles.get('/:id', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const start = Date.now();

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    throw new V2Error('not_found', 404, 'File not found');
  }

  const file = mapFileRecord(record);
  const response = c.json(itemOrLegacy(c, file, { file }));
  logV2Request(c, start, { route_family: 'fileRecords', operation: 'get' });
  return response;
});

// Generate download URL — internal storage_key used here but never exposed to client
myFiles.get('/:id/download-url', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const start = Date.now();

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    throw new V2Error('not_found', 404, 'File not found');
  }
  if (record.is_trashed) {
    throw new V2Error('conflict', 409, 'File is in trash');
  }

  if (record.storage_destination === 'r2') {
    try {
      const { presigned_url, expires_at } = await generatePresignedGetUrl(
        c.env,
        record.bucket,
        record.storage_key,
        DOWNLOAD_URL_TTL_SECONDS,
        record.filename
      );
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');

      const data = {
        upload_id: record.id,
        destination: record.storage_destination,
        download_url: presigned_url,
        expires_at,
      };
      const response = c.json(itemOrLegacy(c, data, data));
      logV2Request(c, start, { route_family: 'fileRecords', operation: 'download_url' });
      return response;
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to generate R2 download URL');
    }
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
  if (!appwriteFileId) {
    throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format');
  }

  try {
    const token = await createAppwriteFileToken(c.env, record.bucket, appwriteFileId, DOWNLOAD_URL_TTL_SECONDS);
    const downloadUrl = buildAppwriteFileDownloadUrl(c.env, record.bucket, appwriteFileId, token.secret);

    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');

    const data = {
      upload_id: record.id,
      destination: record.storage_destination,
      download_url: downloadUrl,
      expires_at: token.expires_at,
    };
    const response = c.json(itemOrLegacy(c, data, data));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'download_url' });
    return response;
  } catch {
    throw new V2Error('bad_gateway', 502, 'Unable to generate Appwrite download URL');
  }
});

// Soft-delete (trash) or permanent delete
myFiles.delete('/:id', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';
  const start = Date.now();

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    throw new V2Error('not_found', 404, 'File not found');
  }

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        await deleteObject(c.env, record.bucket, record.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
        if (!appwriteFileId) {
          throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key');
        }
        await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
      }
    } catch (err) {
      if (err instanceof V2Error) throw err;
      throw new V2Error('bad_gateway', 502, 'Unable to delete file from storage');
    }

    await deactivateShareLinksForFile(c.env.APP_DB, id, serviceId);
    await deleteFileRecordPermanently(c.env.APP_DB, id, userId, serviceId);

    // Release reserved storage after physical deletion.
    await releaseQuota(c.env.APP_DB, serviceId, record.size, record.user_id);

    c.executionCtx.waitUntil(
      logServiceEvent(c.env.APP_DB, {
        serviceId,
        userId,
        action: 'file_deleted',
        resourceType: 'file',
        resourceId: id,
        metadata: { filename: record.filename, size: record.size },
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        actorId: c.get('actorId') ?? null,
        targetUserId: c.get('actorId') ? c.get('userId') : null,
      })
    );

    const response = c.json(actionOrLegacy(c,
      { id, deleted: true, permanent: true },
      { success: true, id, permanent: true }
    ));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'delete' });
    return response;
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!trashed) {
    throw new V2Error('conflict', 409, 'File already in trash');
  }

  const response = c.json(actionOrLegacy(c,
    { id, deleted: false, permanent: false },
    { success: true, id, permanent: false }
  ));
  logV2Request(c, start, { route_family: 'fileRecords', operation: 'delete' });
  return response;
});

// Restore file from trash
myFiles.post('/:id/restore', zValidator('param', fileIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const start = Date.now();

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!restored) {
    throw new V2Error('not_found', 404, 'File not found or not in trash');
  }

  const response = c.json(actionOrLegacy(c,
    { id, restored: true },
    { success: true, id }
  ));
  logV2Request(c, start, { route_family: 'fileRecords', operation: 'restore' });
  return response;
});

const fileUpdateBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
});

// Rename file
myFiles.patch(
  '/:id',
  zValidator('param', fileIdParamSchema, v2ValidationHook),
  zValidator('json', fileUpdateBodySchema, v2ValidationHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const { filename } = c.req.valid('json');
    const start = Date.now();

    const file = await updateFileRecord(c.env.APP_DB, id, userId, serviceId, { filename });
    if (!file) {
      throw new V2Error('not_found', 404, 'File not found');
    }

    const mapped = mapFileRecord(file);
    const response = c.json(itemOrLegacy(c, mapped, { file: mapped }));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'rename' });
    return response;
  }
);

// Move file to target folder — verifies target folder ownership (fixes bug #4)
myFiles.patch(
  '/:id/move',
  zValidator('param', fileIdParamSchema, v2ValidationHook),
  zValidator('json', fileMoveRequestSchema, v2ValidationHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const { folder_id } = c.req.valid('json');
    const start = Date.now();

    // Bug #4 fix: verify the target folder belongs to this user+service before moving
    if (folder_id != null) {
      const targetFolder = await getFolderForUser(c.env.APP_DB, folder_id, userId, serviceId);
      if (!targetFolder) {
        throw new V2Error('not_found', 404, 'Target folder not found');
      }
      if (targetFolder.is_trashed) {
        throw new V2Error('conflict', 409, 'Cannot move file into a trashed folder');
      }
    }

    const moved = await moveFileRecord(c.env.APP_DB, id, userId, serviceId, folder_id ?? null);
    if (!moved) {
      throw new V2Error('not_found', 404, 'File not found or in trash');
    }

    const response = c.json(actionOrLegacy(c,
      { id, success: true, folder_id: folder_id ?? null },
      { success: true, id, folder_id: folder_id ?? null }
    ));
    logV2Request(c, start, { route_family: 'fileRecords', operation: 'move' });
    return response;
  }
);

export default myFiles;
