import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createUpload, getUpload, getUploadForUser, completeUpload, failUpload } from '../db/files';
import { createFileRecord } from '../db/fileRecords';
import { reserveQuota, releaseQuota, logServiceEvent } from '../db/services';
import { rateLimitMiddleware } from '../middleware/ratelimit';
import { generatePresignedPutUrl, headObject } from '../services/r2';
import { getAppwriteUploadConfig, getAppwriteFileMeta, extractAppwriteFileIdFromStorageKey } from '../services/appwrite';
import { getServiceConfig, buildStorageKey } from '../config/services';
import {
  type UploadAppwriteInitResponse,
  type UploadCompleteResponse,
  type UploadFailResponse,
  type UploadR2InitResponse,
  uploadAppwriteInitRequestSchema,
  uploadLifecycleRequestSchema,
  uploadR2InitRequestSchema,
} from '@unisource/sdk';

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

function getDatePath(): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * R2 Upload — Presigned PUT URL
 */
upload.post('/r2/init', rateLimitMiddleware, zValidator('json', uploadR2InitRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');
  const serviceId = c.get('serviceId');
  const userId = c.get('userId');

  const { filename, size, mime_type, folder_id } = body;

  // Quota check and reserve before creating presigned URL (atomic)
  const quotaReserved = await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
  if (!quotaReserved.ok) {
    if (userId !== 'system') {
      c.executionCtx.waitUntil(
        logServiceEvent(c.env.APP_DB, {
          serviceId,
          userId,
          action: 'quota_exceeded',
          resourceType: 'service',
          resourceId: serviceId,
          metadata: { requested_bytes: size },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        })
      );
    }
    return c.json(
      {
        error: 'Conflict',
        message:
          quotaReserved.scope === 'user'
            ? 'Storage quota exceeded for this user'
            : 'Storage quota exceeded for this service',
      },
      409
    );
  }

  const svcConfig = getServiceConfig(serviceId)!;
  if (size > svcConfig.maxFileSizeBytes) {
    return c.json(
      { error: 'Payload Too Large', message: `File exceeds maximum size of ${svcConfig.maxFileSizeBytes} bytes` },
      413
    );
  }

  const uploadId = crypto.randomUUID();
  const ext = filename.includes('.') ? filename.split('.').pop() : '';
  const storageKey = buildStorageKey(serviceId, getDatePath(), uploadId, ext ?? '');

  const { presigned_url, expires_at } = await generatePresignedPutUrl(
    c.env,
    svcConfig.bucketName,    // from config — clients cannot override bucket
    storageKey,
    mime_type,
    UPLOAD_TTL_SECONDS
  );

  await createUpload(c.env.APP_DB, {
    id: uploadId,
    service_id: serviceId,
    user_id: userId === 'system' ? null : userId,
    folder_id: folder_id ?? null,
    filename,
    size,
    mime_type,
    destination: 'r2',
    storage_key: storageKey,
    bucket: svcConfig.bucketName,
    presigned_url,
    expires_at,
  });

  return c.json<UploadR2InitResponse>({
    upload_id: uploadId,
    destination: 'r2',
    presigned_url,
    storage_key: storageKey,
    bucket: svcConfig.bucketName,
    expires_at,
  }, 201);
});

/**
 * Appwrite Upload — Returns credentials for direct Appwrite SDK upload
 */
upload.post('/appwrite/init', rateLimitMiddleware, zValidator('json', uploadAppwriteInitRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');
  const serviceId = c.get('serviceId');
  const userId = c.get('userId');

  const { filename, size, mime_type, folder_id } = body;

  // Quota check and reserve (atomic)
  const quotaReserved = await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
  if (!quotaReserved.ok) {
    if (userId !== 'system') {
      c.executionCtx.waitUntil(
        logServiceEvent(c.env.APP_DB, {
          serviceId,
          userId,
          action: 'quota_exceeded',
          resourceType: 'service',
          resourceId: serviceId,
          metadata: { requested_bytes: size },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        })
      );
    }
    return c.json(
      {
        error: 'Conflict',
        message:
          quotaReserved.scope === 'user'
            ? 'Storage quota exceeded for this user'
            : 'Storage quota exceeded for this service',
      },
      409
    );
  }

  const uploadId = crypto.randomUUID();
  const fileId = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const storageKey = `${serviceId}/uploads/${getDatePath()}/${fileId}`;

  const config = getAppwriteUploadConfig(c.env, fileId, UPLOAD_TTL_SECONDS);

  await createUpload(c.env.APP_DB, {
    id: uploadId,
    service_id: serviceId,
    user_id: userId === 'system' ? null : userId,
    folder_id: folder_id ?? null,
    filename,
    size,
    mime_type,
    destination: 'appwrite',
    storage_key: storageKey,
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
 * Mark upload complete — creates confirmed file record in `files` table
 * Bug #15 fix: verifies the upload belongs to this user + service
 */
upload.post('/complete', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const { upload_id } = c.req.valid('json');
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');

  // Bug #15: use getUploadForUser to prevent cross-user upload hijacking
  // API key path (userId='system') uses getUpload without owner restriction
  const record = userId === 'system'
    ? await getUpload(c.env.APP_DB, upload_id)
    : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

  if (!record) {
    return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
  }

  if (record.status === 'completed') {
    return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (record.expires_at < now) {
    const updated = await failUpload(c.env.APP_DB, upload_id);
    if (updated) {
      // Release quota since upload expired
      await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
    }
    return c.json({ error: 'Gone', message: 'Upload session has expired' }, 410);
  }

  // Verify the file physically exists in storage with the correct size
  let physicalSize: number | null = null;
  if (record.destination === 'r2') {
    const svcConfig = getServiceConfig(record.service_id)!;
    const meta = await headObject(c.env, svcConfig.bucketName, record.storage_key);
    physicalSize = meta?.size ?? null;
  } else {
    const fileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
    if (fileId) {
      const meta = await getAppwriteFileMeta(c.env, record.bucket, fileId);
      physicalSize = meta?.size ?? null;
    }
  }

  if (physicalSize === null || physicalSize !== record.size) {
    const failed = await failUpload(c.env.APP_DB, upload_id);
    if (failed) {
      await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
    }
    return c.json(
      {
        error: 'Conflict',
        message: physicalSize === null ? 'File not found in storage' : 'File size mismatch',
      },
      409
    );
  }

  const updated = await completeUpload(c.env.APP_DB, upload_id);
  if (!updated) {
    return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
  }

  // Promote to confirmed file record and increment service storage usage
  if (userId !== 'system') {
    const newFileId = crypto.randomUUID();
    await createFileRecord(c.env.APP_DB, {
      id: newFileId,
      service_id: serviceId,
      user_id: userId,
      folder_id: record.folder_id ?? null,
      upload_id,
      filename: record.filename,
      size: record.size,
      mime_type: record.mime_type,
      storage_destination: record.destination,
      storage_key: record.storage_key,
      bucket: record.bucket,
    });
    // Quota was already reserved atomically in /init, no need to increment here.
    
    // Audit log
    c.executionCtx.waitUntil(
      logServiceEvent(c.env.APP_DB, {
        serviceId,
        userId,
        action: 'upload_completed',
        resourceType: 'file',
        resourceId: newFileId,
        metadata: { filename: record.filename, size: record.size },
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
      })
    );
  }

  return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
});

upload.post('/fail', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const { upload_id } = c.req.valid('json');
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');

  // Mirror Bug #15 fix from /complete: verify ownership before allowing fail
  const record = userId === 'system'
    ? await getUpload(c.env.APP_DB, upload_id)
    : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

  if (!record || record.service_id !== serviceId) {
    return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
  }

  if (record.status !== 'pending') {
    return c.json({ error: 'Conflict', message: `Upload is already in state: ${record.status}` }, 409);
  }

  const updated = await failUpload(c.env.APP_DB, upload_id);
  // Release reserved quota
  if (updated) {
    await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
  }
  return c.json<UploadFailResponse>({ success: true, upload_id, status: 'failed' });
});

export default upload;
