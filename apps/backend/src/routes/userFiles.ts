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
} from '../db/fileRecords';
import { logServiceEvent, releaseQuota } from '../db/services';
import { deleteObject, generatePresignedGetUrl } from '../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import { getServiceConfig } from '../config/services';
import { deactivateShareLinksForFile } from '../db/shareLinks';
import type {
  FileRecordDetailResponse,
  FileDownloadUrlResponse,
  FileUpdateResponse,
} from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return c.json({ error: 'Bad Request', message: `${path}${issue?.message ?? 'Validation failed'}` }, 400);
}

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
userFiles.get('/:id', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) return c.json({ error: 'Not Found', message: 'File not found' }, 404);

  return c.json<FileRecordDetailResponse>({ file: mapFileRecord(record) });
});

// PATCH /files/:id  { filename } or { folder_id }
userFiles.patch(
  '/:id',
  zValidator('param', idParam, validationErrorHook),
  zValidator('json', updateBody, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const { filename } = c.req.valid('json');

    const file = await updateFileRecord(c.env.APP_DB, id, userId, serviceId, { filename });
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);

    return c.json<FileUpdateResponse>({ file: mapFileRecord(file) });
  }
);

// DELETE /files/:id  ?permanent=bool
userFiles.delete('/:id', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) return c.json({ error: 'Not Found', message: 'File not found' }, 404);

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        const svcConfig = getServiceConfig(serviceId)!;
        await deleteObject(c.env, svcConfig.bucketName, record.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
        if (!appwriteFileId) return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key' }, 500);
        await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
      }
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to delete file from storage' }, 502);
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

    return c.json({ success: true, id, permanent: true });
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!trashed) return c.json({ error: 'Conflict', message: 'File already in trash' }, 409);

  return c.json({ success: true, id, permanent: false });
});

// POST /files/:id/restore
userFiles.post('/:id/restore', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!restored) return c.json({ error: 'Not Found', message: 'File not found or not in trash' }, 404);

  return c.json({ success: true, id });
});

// GET /files/:id/download-url
userFiles.get('/:id/download-url', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  if (record.is_trashed) return c.json({ error: 'Conflict', message: 'File is in trash' }, 409);

  if (record.storage_destination === 'r2') {
    try {
      const svcConfig = getServiceConfig(serviceId)!;
      const { presigned_url, expires_at } = await generatePresignedGetUrl(
        c.env,
        svcConfig.bucketName,
        record.storage_key,
        DOWNLOAD_URL_TTL_SECONDS,
        record.filename
      );
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
      return c.json<FileDownloadUrlResponse>({
        upload_id: record.id,
        destination: record.storage_destination,
        download_url: presigned_url,
        expires_at,
      });
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to generate R2 download URL' }, 502);
    }
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
  if (!appwriteFileId) return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key format' }, 500);

  try {
    const token = await createAppwriteFileToken(c.env, record.bucket, appwriteFileId, DOWNLOAD_URL_TTL_SECONDS);
    const downloadUrl = buildAppwriteFileDownloadUrl(c.env, record.bucket, appwriteFileId, token.secret);
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.json<FileDownloadUrlResponse>({
      upload_id: record.id,
      destination: record.storage_destination,
      download_url: downloadUrl,
      expires_at: token.expires_at,
    });
  } catch {
    return c.json({ error: 'Bad Gateway', message: 'Unable to generate Appwrite download URL' }, 502);
  }
});

export default userFiles;
