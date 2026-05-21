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
} from '../db/fileRecords';
import { getFolderForUser } from '../db/folders';
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
import {
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
  fileMoveRequestSchema,
  type FileRecordDetailResponse,
  type FileRecordsListResponse,
  type FileDownloadUrlResponse,
  type FileUpdateResponse,
} from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

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
myFiles.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      folder_id: query.folder_id ?? null,
      trashed_only: false,
      limit: query.limit,
      cursor: query.cursor,
    });

    return c.json<FileRecordsListResponse>({
      items: result.items.map(mapFileRecord),
      next_cursor: result.next_cursor,
      limit: query.limit,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
    }
    throw err;
  }
});

// List user's trash
myFiles.get('/trash', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      trashed_only: true,
      limit: query.limit,
      cursor: query.cursor,
    });

    return c.json<FileRecordsListResponse>({
      items: result.items.map(mapFileRecord),
      next_cursor: result.next_cursor,
      limit: query.limit,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
    }
    throw err;
  }
});

// Get single file
myFiles.get('/:id', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }

  return c.json<FileRecordDetailResponse>({ file: mapFileRecord(record) });
});

// Generate download URL — internal storage_key used here but never exposed to client
myFiles.get('/:id/download-url', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }
  if (record.is_trashed) {
    return c.json({ error: 'Conflict', message: 'File is in trash' }, 409);
  }

  if (record.storage_destination === 'r2') {
    try {
      const svcConfig = getServiceConfig(serviceId)!;
      const { presigned_url, expires_at } = await generatePresignedGetUrl(
        c.env,
        svcConfig.bucketName,  // use config, not stored bucket name from DB
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
  if (!appwriteFileId) {
    return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key format' }, 500);
  }

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

// Soft-delete (trash) or permanent delete
myFiles.delete('/:id', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        const svcConfig = getServiceConfig(serviceId)!;
        await deleteObject(c.env, svcConfig.bucketName, record.storage_key);
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
        if (!appwriteFileId) {
          return c.json({ error: 'Internal Server Error', message: 'Invalid Appwrite storage key' }, 500);
        }
        await deleteAppwriteFile(c.env, record.bucket, appwriteFileId);
      }
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to delete file from storage' }, 502);
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

    return c.json({ success: true, id, permanent: true });
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!trashed) {
    return c.json({ error: 'Conflict', message: 'File already in trash' }, 409);
  }

  return c.json({ success: true, id, permanent: false });
});

// Restore file from trash
myFiles.post('/:id/restore', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId, serviceId);
  if (!restored) {
    return c.json({ error: 'Not Found', message: 'File not found or not in trash' }, 404);
  }

  return c.json({ success: true, id });
});

const fileUpdateBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
});

// Rename file
myFiles.patch(
  '/:id',
  zValidator('param', fileIdParamSchema, validationErrorHook),
  zValidator('json', fileUpdateBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const { filename } = c.req.valid('json');

    const file = await updateFileRecord(c.env.APP_DB, id, userId, serviceId, { filename });
    if (!file) {
      return c.json({ error: 'Not Found', message: 'File not found' }, 404);
    }

    return c.json<FileUpdateResponse>({ file: mapFileRecord(file) });
  }
);

// Move file to target folder — verifies target folder ownership (fixes bug #4)
myFiles.patch(
  '/:id/move',
  zValidator('param', fileIdParamSchema, validationErrorHook),
  zValidator('json', fileMoveRequestSchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const { folder_id } = c.req.valid('json');

    // Bug #4 fix: verify the target folder belongs to this user+service before moving
    if (folder_id != null) {
      const targetFolder = await getFolderForUser(c.env.APP_DB, folder_id, userId, serviceId);
      if (!targetFolder) {
        return c.json({ error: 'Not Found', message: 'Target folder not found' }, 404);
      }
      if (targetFolder.is_trashed) {
        return c.json({ error: 'Conflict', message: 'Cannot move file into a trashed folder' }, 409);
      }
    }

    const moved = await moveFileRecord(c.env.APP_DB, id, userId, serviceId, folder_id ?? null);
    if (!moved) {
      return c.json({ error: 'Not Found', message: 'File not found or in trash' }, 404);
    }

    return c.json({ success: true, id, folder_id: folder_id ?? null });
  }
);

export default myFiles;
