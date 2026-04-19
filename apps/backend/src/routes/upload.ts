import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createUpload, getUpload, completeUpload, failUpload } from '../db/files';
import { createFileRecord } from '../db/fileRecords';
import { generatePresignedPutUrl } from '../services/r2';
import { getAppwriteUploadConfig } from '../services/appwrite';
import {
  type UploadAppwriteInitResponse,
  type UploadCompleteResponse,
  type UploadFailResponse,
  type UploadR2InitResponse,
  uploadAppwriteInitRequestSchema,
  uploadLifecycleRequestSchema,
  uploadR2InitRequestSchema,
} from '@unisource/sdk';

const DEFAULT_R2_BUCKET = 'unisource';
const UPLOAD_TTL_SECONDS = 3600; // 1 hour

const upload = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

function validationErrorHook(
  result: {
    success: boolean;
    error?: {
      issues: Array<{
          path: Array<PropertyKey>;
        message: string;
      }>;
    };
  },
  c: {
    json: (value: unknown, status?: number) => Response;
  }
) {
  if (result.success) {
    return;
  }

  const firstIssue = result.error?.issues[0];
  const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : '';
  return c.json(
    {
      error: 'Bad Request',
      message: `${issuePath}${firstIssue?.message ?? 'Request validation failed'}`,
    },
    400
  );
}

/**
 * R2 Implementation
 */
upload.post('/r2/init', zValidator('json', uploadR2InitRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');

  const { filename, size, mime_type, bucket } = body;
  const uploadId = crypto.randomUUID();
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const datePath = `${year}/${month}/${day}`;
  
  const ext = filename.includes('.') ? filename.split('.').pop() : '';
  const storageKey = `uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
  const targetBucket = (typeof bucket === 'string' && bucket.trim()) ? bucket.trim() : DEFAULT_R2_BUCKET;

  const { presigned_url, expires_at } = await generatePresignedPutUrl(
    c.env,
    targetBucket,
    storageKey,
    mime_type,
    UPLOAD_TTL_SECONDS
  );

  await createUpload(c.env.usrc_d1, {
    id: uploadId,
    filename,
    size,
    mime_type,
    destination: 'r2',
    storage_key: storageKey,
    bucket: targetBucket,
    presigned_url,
    expires_at,
  });

  return c.json<UploadR2InitResponse>({
    upload_id: uploadId,
    destination: 'r2',
    presigned_url,
    storage_key: storageKey,
    bucket: targetBucket,
    expires_at,
  }, 201);
});

/**
 * Appwrite Implementation
 */
upload.post('/appwrite/init', zValidator('json', uploadAppwriteInitRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');

  const { filename, size, mime_type } = body;
  const uploadId = crypto.randomUUID();
  const fileId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const datePath = `${year}/${month}/${day}`;

  const config = getAppwriteUploadConfig(c.env, fileId, UPLOAD_TTL_SECONDS);

  await createUpload(c.env.usrc_d1, {
    id: uploadId,
    filename,
    size,
    mime_type,
    destination: 'appwrite',
    storage_key: `uploads/${datePath}/${fileId}`,
    bucket: config.bucket_id,
    presigned_url: null,
    expires_at: config.expires_at,
  });

  return c.json<UploadAppwriteInitResponse>({
    upload_id: uploadId,
    destination: 'appwrite',
    appwrite_endpoint: config.endpoint,
    appwrite_project_id: config.project_id,
    appwrite_bucket_id: config.bucket_id,
    file_id: fileId,
    expires_at: config.expires_at,
  }, 201);
});

/**
 * Lifecycle Management (Shared)
 */
upload.post('/complete', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const { upload_id } = c.req.valid('json');

  const record = await getUpload(c.env.usrc_d1, upload_id);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
  }

  if (record.status === 'completed') {
    return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (record.expires_at < now) {
    await failUpload(c.env.usrc_d1, upload_id);
    return c.json({ error: 'Gone', message: 'Upload session has expired' }, 410);
  }

  const updated = await completeUpload(c.env.usrc_d1, upload_id);
  if (!updated) {
    return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
  }

  // Promote to confirmed file record (linked to authenticated user)
  const userId = c.get('userId') as string | undefined;
  if (userId) {
    await createFileRecord(c.env.usrc_d1, {
      id: crypto.randomUUID(),
      user_id: userId,
      upload_id,
      filename: record.filename,
      size: record.size,
      mime_type: record.mime_type,
      storage_destination: record.destination,
      storage_key: record.storage_key,
      bucket: record.bucket,
    });
  }

  return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
});

upload.post('/fail', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const { upload_id } = c.req.valid('json');

  const record = await getUpload(c.env.usrc_d1, upload_id);
  if (!record) {
    return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
  }

  if (record.status !== 'pending') {
    return c.json({ error: 'Conflict', message: `Upload is already in state: ${record.status}` }, 409);
  }

  await failUpload(c.env.usrc_d1, upload_id);
  return c.json<UploadFailResponse>({ success: true, upload_id, status: 'failed' });
});

export default upload;
