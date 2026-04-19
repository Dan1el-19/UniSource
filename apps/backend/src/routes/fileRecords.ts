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
  type FileRecord,
} from '../db/fileRecords';
import { deleteObject, generatePresignedGetUrl } from '../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import {
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
  fileMoveRequestSchema,
  type FileRecordFullResponse,
  type FileRecordsListResponse,
  type FileDownloadUrlResponse,
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

function mapFileRecord(record: FileRecord): FileRecordFullResponse {
  return {
    id: record.id,
    user_id: record.user_id,
    folder_id: record.folder_id,
    upload_id: record.upload_id,
    filename: record.filename,
    size: record.size,
    mime_type: record.mime_type,
    storage_destination: record.storage_destination,
    storage_key: record.storage_key,
    bucket: record.bucket,
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
  const query = c.req.valid('query');

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
      folder_id: query.folder_id,
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
  const query = c.req.valid('query');

  try {
    const result = await listFileRecords(c.env.APP_DB, {
      user_id: userId,
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
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }

  return c.json<FileRecordFullResponse>(mapFileRecord(record));
});

// Generate download URL
myFiles.get('/:id/download-url', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const { id } = c.req.valid('param');

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }
  if (record.is_trashed) {
    return c.json({ error: 'Conflict', message: 'File is in trash' }, 409);
  }

  if (record.storage_destination === 'r2') {
    try {
      const { presigned_url, expires_at } = await generatePresignedGetUrl(
        c.env,
        record.bucket,
        record.storage_key,
        DOWNLOAD_URL_TTL_SECONDS
      );
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
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'File not found' }, 404);
  }

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        await deleteObject(c.env, record.bucket, record.storage_key);
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

    await deleteFileRecordPermanently(c.env.APP_DB, id, userId);
    return c.json({ success: true, id, permanent: true });
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId);
  if (!trashed) {
    return c.json({ error: 'Conflict', message: 'File already in trash' }, 409);
  }

  return c.json({ success: true, id, permanent: false });
});

// Restore file from trash
myFiles.post('/:id/restore', zValidator('param', fileIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const { id } = c.req.valid('param');

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId);
  if (!restored) {
    return c.json({ error: 'Not Found', message: 'File not found or not in trash' }, 404);
  }

  return c.json({ success: true, id });
});

// Move file to a different folder
myFiles.patch(
  '/:id/move',
  zValidator('param', fileIdParamSchema, validationErrorHook),
  zValidator('json', fileMoveRequestSchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const { id } = c.req.valid('param');
    const { folder_id } = c.req.valid('json');

    const moved = await moveFileRecord(c.env.APP_DB, id, userId, folder_id ?? null);
    if (!moved) {
      return c.json({ error: 'Not Found', message: 'File not found or in trash' }, 404);
    }

    return c.json({ success: true, id, folder_id: folder_id ?? null });
  }
);

export default myFiles;
