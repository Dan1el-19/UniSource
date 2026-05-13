import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createUpload, getUpload, getUploadForUser, completeUpload, failUpload, completeUploadAndCreateFile } from '../db/files';
import { createFileRecord, createMainStorageFileRecord } from '../db/fileRecords';
import { reserveQuota, releaseQuota, logServiceEvent, reserveMainStorageQuota, releaseMainStorageQuota } from '../db/services';
import { rateLimitMiddleware } from '../middleware/ratelimit';
import {
  generatePresignedPutUrl,
  headObject,
  createMultipartUpload,
  signUploadPart,
  listUploadedParts,
  completeMultipartUpload,
  abortMultipartUpload,
} from '../services/r2';
import { getAppwriteUploadConfig, getAppwriteFileMeta, extractAppwriteFileIdFromStorageKey } from '../services/appwrite';
import { getServiceConfig, buildStorageKey, buildAppwriteStorageKey } from '../config/services';
import { canWriteMainStorage, mainStorageForbiddenResponse } from '../middleware/mainStorageGuard';
import {
  type UploadAppwriteInitResponse,
  type UploadCompleteResponse,
  type UploadFailResponse,
  type UploadR2InitResponse,
  type MultipartCreateResponse,
  type MultipartSignPartResponse,
  type MultipartListPartsResponse,
  type MultipartCompleteResponse,
  type MultipartAbortResponse,
  uploadAppwriteInitRequestSchema,
  uploadLifecycleRequestSchema,
  uploadR2InitRequestSchema,
  multipartCreateRequestSchema,
  multipartSignPartQuerySchema,
  multipartListPartsQuerySchema,
  multipartCompleteRequestSchema,
  multipartAbortRequestSchema,
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

  // S1: only admin/plus/system can target main storage.
  if (body.is_main_storage === true && !canWriteMainStorage(c)) {
    return mainStorageForbiddenResponse(c);
  }

  const { filename, size, mime_type, folder_id } = body;

  // Quota check and reserve before creating presigned URL (atomic)
  const quotaResult = body.is_main_storage
    ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
    : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
  if (!quotaResult.ok) {
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
    const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
    return c.json(
      {
        error: 'Conflict',
        message:
          scope === 'user'
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
    is_main_storage: body.is_main_storage === true,
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

  // S1: only admin/plus/system can target main storage.
  if (body.is_main_storage === true && !canWriteMainStorage(c)) {
    return mainStorageForbiddenResponse(c);
  }

  const { filename, size, mime_type, folder_id } = body;

  // Quota check and reserve (atomic)
  const quotaResult = body.is_main_storage
    ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
    : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
  if (!quotaResult.ok) {
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
    const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
    return c.json(
      {
        error: 'Conflict',
        message:
          scope === 'user'
            ? 'Storage quota exceeded for this user'
            : 'Storage quota exceeded for this service',
      },
      409
    );
  }

  const uploadId = crypto.randomUUID();
  // Task 1: use full UUID v4 (122 bits) instead of 80-bit truncated id and
  // share the same `<prefix>/uploads/<datePath>/<id>` shape as R2 so
  // extractAppwriteFileIdFromStorageKey() keeps working.
  const fileId = crypto.randomUUID();
  const storageKey = buildAppwriteStorageKey(serviceId, getDatePath(), fileId);

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
    is_main_storage: body.is_main_storage === true,
  });

  return c.json<UploadAppwriteInitResponse>({
    upload_id: uploadId,
    destination: 'appwrite',
    appwrite_endpoint: config.endpoint,
    appwrite_project_id: config.project_id,
    appwrite_bucket_id: config.bucket_id,
    file_id: fileId,
    expires_at: config.expires_at,
    ...(c.get('appwriteJwt') ? { jwt: c.get('appwriteJwt') } : {}),
  }, 201);
});

/**
 * Mark upload complete — creates confirmed file record in `files` table
 * Bug #15 fix: verifies the upload belongs to this user + service
 */
upload.post('/complete', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');
  const { upload_id } = body;
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

  const isMainStorage = record.is_main_storage === 1;

  if (record.status === 'completed') {
    return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
  }

  const now = Math.floor(Date.now() / 1000);
  if (record.expires_at < now) {
    const updated = await failUpload(c.env.APP_DB, upload_id);
    if (updated) {
      // Release quota since upload expired
      if (isMainStorage) {
        await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
      } else {
        await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
      }
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
      if (isMainStorage) {
        await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
      } else {
        await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
      }
    }
    return c.json(
      {
        error: 'Conflict',
        message: physicalSize === null ? 'File not found in storage' : 'File size mismatch',
      },
      409
    );
  }

  // B3: atomically transition status -> completed AND insert the file row.
  // If the worker dies after this call, recovery is trivial — both rows are
  // either present or absent.
  const newFileId = crypto.randomUUID();

  // Promote to confirmed file record. API-key uploads are promoted for main storage,
  // while regular per-user file records still require an authenticated user owner.
  if (userId !== 'system' || isMainStorage) {
    const promotion = await completeUploadAndCreateFile(c.env.APP_DB, {
      uploadId: upload_id,
      file: {
        id: newFileId,
        service_id: serviceId,
        user_id: isMainStorage ? userId : userId,
        folder_id: isMainStorage ? null : record.folder_id ?? null,
        upload_id,
        filename: record.filename,
        size: record.size,
        mime_type: record.mime_type,
        storage_destination: record.destination,
        storage_key: record.storage_key,
        bucket: record.bucket,
        is_main_storage: isMainStorage,
      },
    });

    if (!promotion.completed && !promotion.alreadyCompleted) {
      return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
    }

    // Quota was already reserved atomically in /init, no need to increment here.

    if (userId !== 'system' && promotion.completed) {
      c.executionCtx.waitUntil(
        logServiceEvent(c.env.APP_DB, {
          serviceId,
          userId,
          action: 'upload_completed',
          resourceType: 'file',
          resourceId: newFileId,
          metadata: { filename: record.filename, size: record.size, is_main_storage: isMainStorage },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        })
      );
    }
  } else {
    // Anonymous (system) non-main upload: just flip the upload row.
    const updated = await completeUpload(c.env.APP_DB, upload_id);
    if (!updated) {
      return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
    }
  }

  return c.json<UploadCompleteResponse>({ success: true, upload_id, status: 'completed' });
});

upload.post('/fail', zValidator('json', uploadLifecycleRequestSchema, validationErrorHook), async (c) => {
  const body = c.req.valid('json');
  const { upload_id } = body;
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');

  // Mirror Bug #15 fix from /complete: verify ownership before allowing fail
  const record = userId === 'system'
    ? await getUpload(c.env.APP_DB, upload_id)
    : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

  if (!record || record.service_id !== serviceId) {
    return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
  }

  const isMainStorage = record.is_main_storage === 1;

  if (record.status !== 'pending') {
    return c.json({ error: 'Conflict', message: `Upload is already in state: ${record.status}` }, 409);
  }

  const updated = await failUpload(c.env.APP_DB, upload_id);
  // Release reserved quota
  if (updated) {
    if (isMainStorage) {
      await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
    } else {
      await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
    }
  }
  return c.json<UploadFailResponse>({ success: true, upload_id, status: 'failed' });
});

// ─── Multipart Upload endpoints ───────────────────────────────────────────────

const MULTIPART_PART_URL_TTL_SECONDS = 900; // 15 min per part presigned URL

/**
 * Resolves the stored upload record + validates that it belongs to the caller
 * and was created via multipart. Shared helper for all multipart endpoints.
 */
async function getOwnedMultipartUpload(
  c: {
    env: CloudflareBindings;
    get: (k: 'userId' | 'serviceId') => string;
  },
  uploadId: string
) {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');

  const record = userId === 'system'
    ? await getUpload(c.env.APP_DB, uploadId)
    : await getUploadForUser(c.env.APP_DB, uploadId, userId, serviceId);

  if (!record || record.service_id !== serviceId) {
    return { error: 'not_found' as const };
  }

  if (record.upload_type !== 'multipart' || !record.r2_upload_id) {
    return { error: 'not_multipart' as const };
  }

  if (record.destination !== 'r2') {
    return { error: 'not_r2' as const };
  }

  return { record };
}

/**
 * R2 Multipart — Create (CreateMultipartUploadCommand)
 */
upload.post(
  '/r2/multipart/create',
  rateLimitMiddleware,
  zValidator('json', multipartCreateRequestSchema, validationErrorHook),
  async (c) => {
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');

    // S1: only admin/plus/system can target main storage.
    if (body.is_main_storage === true && !canWriteMainStorage(c)) {
      return mainStorageForbiddenResponse(c);
    }

    const { filename, size, mime_type, folder_id } = body;

    const svcConfig = getServiceConfig(serviceId)!;
    if (size > svcConfig.maxFileSizeBytes) {
      return c.json(
        { error: 'Payload Too Large', message: `File exceeds maximum size of ${svcConfig.maxFileSizeBytes} bytes` },
        413
      );
    }

    // Reserve the full size up-front; releases on abort/fail/expiry.
    const quotaResult = body.is_main_storage
      ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
      : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);

    if (!quotaResult.ok) {
      if (userId !== 'system') {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'quota_exceeded',
            resourceType: 'service',
            resourceId: serviceId,
            metadata: { requested_bytes: size, upload_type: 'multipart' },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
      const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
      return c.json(
        {
          error: 'Conflict',
          message:
            scope === 'user'
              ? 'Storage quota exceeded for this user'
              : 'Storage quota exceeded for this service',
        },
        409
      );
    }

    const uploadRecordId = crypto.randomUUID();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const storageKey = buildStorageKey(serviceId, getDatePath(), uploadRecordId, ext ?? '');

    let r2UploadId: string;
    try {
      const result = await createMultipartUpload(c.env, svcConfig.bucketName, storageKey, mime_type);
      r2UploadId = result.upload_id;
    } catch (err) {
      // Release quota if R2 CreateMultipartUpload fails.
      if (body.is_main_storage) {
        await releaseMainStorageQuota(c.env.APP_DB, serviceId, size);
      } else {
        await releaseQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
      }
      throw err;
    }

    // Multipart lifetime: R2 auto-aborts after 7 days. We mirror the limit.
    const expires_at = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    await createUpload(c.env.APP_DB, {
      id: uploadRecordId,
      service_id: serviceId,
      user_id: userId === 'system' ? null : userId,
      folder_id: folder_id ?? null,
      filename,
      size,
      mime_type,
      destination: 'r2',
      storage_key: storageKey,
      bucket: svcConfig.bucketName,
      presigned_url: null,
      expires_at,
      is_main_storage: body.is_main_storage === true,
      upload_type: 'multipart',
      r2_upload_id: r2UploadId,
    });

    return c.json<MultipartCreateResponse>(
      {
        upload_id: uploadRecordId,
        r2_upload_id: r2UploadId,
        key: storageKey,
        bucket: svcConfig.bucketName,
        expires_at,
      },
      201
    );
  }
);

/**
 * R2 Multipart — Sign a single part (UploadPartCommand presigned)
 */
upload.get(
  '/r2/multipart/sign-part',
  zValidator('query', multipartSignPartQuerySchema, validationErrorHook),
  async (c) => {
    const { upload_id, part_number } = c.req.valid('query');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
      }
      return c.json(
        { error: 'Conflict', message: 'Upload is not a multipart R2 upload' },
        409
      );
    }

    const { record } = result;

    if (record.status !== 'pending') {
      return c.json({ error: 'Conflict', message: `Upload is in state: ${record.status}` }, 409);
    }

    const signed = await signUploadPart(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!,
      part_number,
      MULTIPART_PART_URL_TTL_SECONDS
    );

    return c.json<MultipartSignPartResponse>({
      url: signed.url,
      expires_at: signed.expires_at,
    });
  }
);

/**
 * R2 Multipart — List uploaded parts (ListPartsCommand) for resume support.
 */
upload.get(
  '/r2/multipart/list-parts',
  zValidator('query', multipartListPartsQuerySchema, validationErrorHook),
  async (c) => {
    const { upload_id } = c.req.valid('query');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
      }
      return c.json(
        { error: 'Conflict', message: 'Upload is not a multipart R2 upload' },
        409
      );
    }

    const { record } = result;

    const parts = await listUploadedParts(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!
    );

    return c.json<MultipartListPartsResponse>({ parts });
  }
);

/**
 * R2 Multipart — Complete (CompleteMultipartUploadCommand + promote to files)
 */
upload.post(
  '/r2/multipart/complete',
  zValidator('json', multipartCompleteRequestSchema, validationErrorHook),
  async (c) => {
    const body = c.req.valid('json');
    const { upload_id, parts } = body;
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
      }
      return c.json(
        { error: 'Conflict', message: 'Upload is not a multipart R2 upload' },
        409
      );
    }

    const { record } = result;

    if (record.status === 'completed') {
      return c.json<MultipartCompleteResponse>({ success: true, upload_id, status: 'completed' });
    }

    const now = Math.floor(Date.now() / 1000);
    const isMainStorage = record.is_main_storage === 1;

    if (record.expires_at < now) {
      const failed = await failUpload(c.env.APP_DB, upload_id);
      if (failed) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
        await abortMultipartUpload(c.env, record.bucket, record.storage_key, record.r2_upload_id!).catch((err) => {
          console.error('[multipart/complete] abortMultipartUpload after expiry failed', err);
        });
      }
      return c.json({ error: 'Gone', message: 'Upload session has expired' }, 410);
    }

    // Tell R2 to stitch the parts together.
    try {
      await completeMultipartUpload(
        c.env,
        record.bucket,
        record.storage_key,
        record.r2_upload_id!,
        parts
      );
    } catch (err) {
      // S5: keep upstream error in server logs; do not echo to clients.
      console.error('[multipart/complete] R2 CompleteMultipartUpload failed', err);
      return c.json(
        { error: 'Conflict', message: 'Failed to complete multipart upload' },
        409
      );
    }

    // Verify physical size matches the reserved size.
    const meta = await headObject(c.env, record.bucket, record.storage_key);
    if (!meta || meta.size !== record.size) {
      const failed = await failUpload(c.env.APP_DB, upload_id);
      if (failed) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
      }
      return c.json(
        {
          error: 'Conflict',
          message: !meta ? 'File not found in storage' : 'File size mismatch',
        },
        409
      );
    }

    const newFileId = crypto.randomUUID();

    if (userId !== 'system' || isMainStorage) {
      const promotion = await completeUploadAndCreateFile(c.env.APP_DB, {
        uploadId: upload_id,
        file: {
          id: newFileId,
          service_id: serviceId,
          user_id: userId,
          folder_id: isMainStorage ? null : record.folder_id ?? null,
          upload_id,
          filename: record.filename,
          size: record.size,
          mime_type: record.mime_type,
          storage_destination: record.destination,
          storage_key: record.storage_key,
          bucket: record.bucket,
          is_main_storage: isMainStorage,
        },
      });

      if (!promotion.completed && !promotion.alreadyCompleted) {
        return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
      }

      if (userId !== 'system' && promotion.completed) {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'upload_completed',
            resourceType: 'file',
            resourceId: newFileId,
            metadata: {
              filename: record.filename,
              size: record.size,
              is_main_storage: isMainStorage,
              upload_type: 'multipart',
              parts: parts.length,
            },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
    } else {
      const updated = await completeUpload(c.env.APP_DB, upload_id);
      if (!updated) {
        return c.json({ error: 'Conflict', message: 'Upload could not be completed' }, 409);
      }
    }

    return c.json<MultipartCompleteResponse>({ success: true, upload_id, status: 'completed' });
  }
);

/**
 * R2 Multipart — Abort (AbortMultipartUploadCommand + release quota)
 */
upload.delete(
  '/r2/multipart/abort',
  zValidator('json', multipartAbortRequestSchema, validationErrorHook),
  async (c) => {
    const body = c.req.valid('json');
    const { upload_id } = body;

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        return c.json({ error: 'Not Found', message: 'Upload record not found' }, 404);
      }
      return c.json(
        { error: 'Conflict', message: 'Upload is not a multipart R2 upload' },
        409
      );
    }

    const { record } = result;
    const isMainStorage = record.is_main_storage === 1;

    if (record.status !== 'pending') {
      return c.json({ error: 'Conflict', message: `Upload is already in state: ${record.status}` }, 409);
    }

    // Tell R2 to drop all uploaded parts.
    await abortMultipartUpload(c.env, record.bucket, record.storage_key, record.r2_upload_id!).catch((err) => {
      console.error('[multipart/abort] abortMultipartUpload failed', err);
    });

    const updated = await failUpload(c.env.APP_DB, upload_id);
    if (updated) {
      if (isMainStorage) {
        await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
      } else {
        await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
      }
    }

    return c.json<MultipartAbortResponse>({ success: true, upload_id, status: 'failed' });
  }
);

export default upload;
