/**
 * /files/:id — Plan 2 user-facing file endpoints
 * Mirrors /my-files/:id but under the /files/:id path expected by service-b.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  deleteFileRecordPermanently,
  getFileRecordForUser,
  restoreFileRecord,
  trashFileRecord,
  updateFileRecord,
  type FileRecord,
} from '../../db/v1/fileRecords';
import { logServiceEvent, releaseQuota } from '../../db/v1/services';
import { deleteObject, generatePresignedGetUrl } from '../../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../../services/appwrite';
import { deactivateShareLinksForFile } from '../../db/v1/shareLinks';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;


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
    is_trashed: record.is_trashed === 1,
    trashed_at: record.trashed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

const idParam = z.object({ id: z.string().trim().min(1) });
const updateBody = z.object({ filename: z.string().trim().min(1).max(255) });

const userFiles = new Hono<HonoEnv>();

// GET /files/:id
userFiles.get('/:id', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) throw new V2Error('not_found', 404, 'File not found');

  const mapped = mapFileRecord(record);
  const response = c.json({ item: mapped });
  logV2Request(c, start, { route_family: 'userFiles', operation: 'get' });
  return response;
});

// PATCH /files/:id  { filename } or { folder_id }
userFiles.patch(
  '/:id',
  zValidator('param', idParam, v2ValidationHook),
  zValidator('json', updateBody, v2ValidationHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const start = Date.now();
    const { id } = c.req.valid('param');
    const { filename } = c.req.valid('json');

    const file = await updateFileRecord(c.env.APP_DB, id, userId, serviceId, { filename });
    if (!file) throw new V2Error('not_found', 404, 'File not found');

    const mapped = mapFileRecord(file);
    const response = c.json({ item: mapped });
    logV2Request(c, start, { route_family: 'userFiles', operation: 'update' });
    return response;
  }
);

// DELETE /files/:id  ?permanent=bool
userFiles.delete('/:id', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) throw new V2Error('not_found', 404, 'File not found');

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        await deleteObject(c.env, record.bucket, record.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
        if (!appwriteFileId) throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key');
        await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
      }
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to delete file from storage');
    }

    await deactivateShareLinksForFile(c.env.APP_DB, id, serviceId);
    await deleteFileRecordPermanently(c.env.APP_DB, id, userId, serviceId);
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

    const permResponse = c.json({ item: { id, deleted: true, permanent: true } });
    logV2Request(c, start, { route_family: 'userFiles', operation: 'delete' });
    return permResponse;
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!trashed) throw new V2Error('conflict', 409, 'File already in trash');

  const response = c.json({ item: { id, deleted: false, permanent: false } });
  logV2Request(c, start, { route_family: 'userFiles', operation: 'delete' });
  return response;
});

// POST /files/:id/restore
userFiles.post('/:id/restore', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const { id } = c.req.valid('param');

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!restored) throw new V2Error('not_found', 404, 'File not found or not in trash');

  const response = c.json({ item: { id, restored: true } });
  logV2Request(c, start, { route_family: 'userFiles', operation: 'restore' });
  return response;
});

// GET /files/:id/download-url
userFiles.get('/:id/download-url', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const start = Date.now();
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) throw new V2Error('not_found', 404, 'File not found');
  if (record.is_trashed) throw new V2Error('conflict', 409, 'File is in trash');

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
      const r2Response = c.json({ item: data });
      logV2Request(c, start, { route_family: 'userFiles', operation: 'download_url' });
      return r2Response;
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to generate R2 download URL');
    }
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
  if (!appwriteFileId) throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format');

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
    const appwriteResponse = c.json({ item: data });
    logV2Request(c, start, { route_family: 'userFiles', operation: 'download_url' });
    return appwriteResponse;
  } catch {
    throw new V2Error('bad_gateway', 502, 'Unable to generate Appwrite download URL');
  }
});

export default userFiles;
