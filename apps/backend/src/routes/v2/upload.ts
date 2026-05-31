import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createUpload, getUpload, getUploadForUser, completeUpload, failUpload, completeUploadAndCreateFile } from '../../db/v1/files';
import { reserveQuota, releaseQuota, logServiceEvent, reserveMainStorageQuota, releaseMainStorageQuota } from '../../db/v1/services';
import { rateLimit } from '../../middleware/ratelimit';
import {
  generatePresignedPutUrl,
  headObject,
  createMultipartUpload,
  signUploadPart,
  listUploadedParts,
  completeMultipartUpload,
  abortMultipartUpload,
} from '../../services/r2';
import { getAppwriteUploadConfig, getAppwriteFileMeta, extractAppwriteFileIdFromStorageKey } from '../../services/appwrite';
import { buildStorageKey, buildAppwriteStorageKey } from '../../services/storageKeys';
import { canWriteMainStorage } from '../../middleware/mainStorageGuard';
import { requireApiKeyPermission } from '../../middleware/apiKeyPermissions';
import { V2Error } from '../../lib/v2/errors';
import { v2ValidationHook } from '../../lib/v2/zodHook';
import { logV2Request } from '../../lib/v2/log';
import {
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
upload.post(
  '/r2/init',
  rateLimit('upload-init'),
  zValidator('json', uploadR2InitRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    requireApiKeyPermission(c, 'upload');

    if (body.is_main_storage === true && !canWriteMainStorage(c, true)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
      );
    }

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
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadId = crypto.randomUUID();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const storageKey = buildStorageKey(service.object_key_prefix, getDatePath(), uploadId, ext ?? '');

    const { presigned_url, expires_at } = await generatePresignedPutUrl(
      c.env,
      service.default_bucket,
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
      bucket: service.default_bucket,
      presigned_url,
      expires_at,
      is_main_storage: body.is_main_storage === true,
    });

    const response = c.json(
      {
        item: {
          upload_id: uploadId,
          destination: 'r2' as const,
          presigned_url,
          storage_key: storageKey,
          bucket: service.default_bucket,
          expires_at,
        },
      },
      201
    );
    logV2Request(c, start, { route_family: 'upload', operation: 'r2_init' });
    return response;
  }
);

/**
 * Appwrite Upload — Returns credentials for direct Appwrite SDK upload
 */
upload.post(
  '/appwrite/init',
  rateLimit('upload-init'),
  zValidator('json', uploadAppwriteInitRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    requireApiKeyPermission(c, 'upload');

    if (body.is_main_storage === true && !canWriteMainStorage(c, true)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
      );
    }

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
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadId = crypto.randomUUID();
    // Task 1: use full UUID v4 (122 bits) instead of 80-bit truncated id and
    // share the same `<prefix>/uploads/<datePath>/<id>` shape as R2 so
    // extractAppwriteFileIdFromStorageKey() keeps working.
    const fileId = crypto.randomUUID();
    const storageKey = buildAppwriteStorageKey(service.object_key_prefix, getDatePath(), fileId);

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

    const item = {
      upload_id: uploadId,
      destination: 'appwrite' as const,
      appwrite_endpoint: config.endpoint,
      appwrite_project_id: config.project_id,
      appwrite_bucket_id: config.bucket_id,
      file_id: fileId,
      expires_at: config.expires_at,
      ...(c.get('appwriteJwt') ? { jwt: c.get('appwriteJwt') } : {}),
    };

    const response = c.json({ item }, 201);
    logV2Request(c, start, { route_family: 'upload', operation: 'appwrite_init' });
    return response;
  }
);

/**
 * Mark upload complete — creates confirmed file record in `files` table
 * Bug #15 fix: verifies the upload belongs to this user + service
 */
upload.post(
  '/complete',
  zValidator('json', uploadLifecycleRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id } = body;
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');

    requireApiKeyPermission(c, 'upload');

    const record = userId === 'system'
      ? await getUpload(c.env.APP_DB, upload_id)
      : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

    if (!record || record.service_id !== serviceId) {
      throw new V2Error('not_found', 404, 'Upload record not found');
    }

    const isMainStorage = record.is_main_storage === 1;

    if (record.status === 'completed') {
      // Idempotent: return existing state. file_id may be null if completed by anonymous (system, non-main) path.
      const existingFile = await c.env.APP_DB
        .prepare('SELECT id FROM files WHERE upload_id = ? LIMIT 1')
        .bind(upload_id)
        .first<{ id: string }>();
      const response = c.json({
        item: {
          id: upload_id,
          status: 'completed' as const,
          upload_type: (record.upload_type ?? 'single') as 'single' | 'multipart',
          file_id: existingFile?.id ?? null,
        },
      });
      logV2Request(c, start, { route_family: 'upload', operation: 'complete' });
      return response;
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      const updated = await failUpload(c.env.APP_DB, upload_id);
      if (updated) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
      }
      throw new V2Error('gone', 410, 'Upload session has expired');
    }

    let physicalSize: number | null = null;
    if (record.destination === 'r2') {
      const meta = await headObject(c.env, record.bucket, record.storage_key);
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
      throw new V2Error(
        'conflict',
        409,
        physicalSize === null ? 'File not found in storage' : 'File size mismatch'
      );
    }

    const newFileId = crypto.randomUUID();
    let createdFileId: string | null = null;

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
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = promotion.completed ? newFileId : null;

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
      // Anonymous (system, non-main) path: just flip the upload row.
      const updated = await completeUpload(c.env.APP_DB, upload_id);
      if (!updated) {
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = null;
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'completed' as const,
        upload_type: (record.upload_type ?? 'single') as 'single' | 'multipart',
        file_id: createdFileId,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'complete' });
    return response;
  }
);

/**
 * Mark upload as failed — fails the upload and releases quota
 */
upload.post(
  '/fail',
  zValidator('json', uploadLifecycleRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { upload_id } = c.req.valid('json');
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');

    requireApiKeyPermission(c, 'upload');

    const record = userId === 'system'
      ? await getUpload(c.env.APP_DB, upload_id)
      : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

    if (!record || record.service_id !== serviceId) {
      throw new V2Error('not_found', 404, 'Upload record not found');
    }

    const updated = await failUpload(c.env.APP_DB, upload_id);
    if (updated) {
      if (record.is_main_storage === 1) {
        await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
      } else {
        await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
      }
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'failed' as const,
        upload_type: (record.upload_type ?? 'single') as 'single' | 'multipart',
        file_id: null,
      },
    });

    logV2Request(c, start, { route_family: 'upload', operation: 'fail' });
    return response;
  }
);

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
  rateLimit('upload-init'),
  zValidator('json', multipartCreateRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    requireApiKeyPermission(c, 'upload');

    if (body.is_main_storage === true && !canWriteMainStorage(c, true)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
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
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadRecordId = crypto.randomUUID();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const storageKey = buildStorageKey(service.object_key_prefix, getDatePath(), uploadRecordId, ext ?? '');

    let r2UploadId: string;
    try {
      const result = await createMultipartUpload(c.env, service.default_bucket, storageKey, mime_type);
      r2UploadId = result.upload_id;
    } catch (err) {
      // Release quota if R2 CreateMultipartUpload fails.
      if (body.is_main_storage) {
        await releaseMainStorageQuota(c.env.APP_DB, serviceId, size);
      } else {
        await releaseQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
      }
      console.error('[multipart/create] R2 createMultipartUpload failed', err);
      throw new V2Error('bad_gateway', 502, 'Unable to create multipart upload on R2');
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
      bucket: service.default_bucket,
      presigned_url: null,
      expires_at,
      is_main_storage: body.is_main_storage === true,
      upload_type: 'multipart',
      r2_upload_id: r2UploadId,
    });

    const response = c.json(
      {
        item: {
          upload_id: uploadRecordId,
          r2_upload_id: r2UploadId,
          key: storageKey,
          bucket: service.default_bucket,
          expires_at,
        },
      },
      201
    );
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_create' });
    return response;
  }
);

/**
 * R2 Multipart — Sign a single part (UploadPartCommand presigned)
 */
upload.get(
  '/r2/multipart/sign-part',
  zValidator('query', multipartSignPartQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { upload_id, part_number } = c.req.valid('query');

    requireApiKeyPermission(c, 'upload');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    if (record.status !== 'pending') {
      throw new V2Error('conflict', 409, `Upload is in state: ${record.status}`);
    }

    const signed = await signUploadPart(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!,
      part_number,
      MULTIPART_PART_URL_TTL_SECONDS
    );

    const response = c.json({
      item: {
        url: signed.url,
        expires_at: signed.expires_at,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_sign_part' });
    return response;
  }
);

/**
 * R2 Multipart — List uploaded parts (ListPartsCommand) for resume support.
 */
const MULTIPART_LIST_PARTS_LIMIT = 1000;

upload.get(
  '/r2/multipart/list-parts',
  zValidator('query', multipartListPartsQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { upload_id } = c.req.valid('query');

    requireApiKeyPermission(c, 'upload');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    const parts = await listUploadedParts(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!
    );

    const response = c.json({
      items: parts,
      page: {
        limit: MULTIPART_LIST_PARTS_LIMIT,
        next_cursor: null as string | null,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_list_parts' });
    return response;
  }
);

/**
 * R2 Multipart — Complete (CompleteMultipartUploadCommand + promote to files)
 */
upload.post(
  '/r2/multipart/complete',
  zValidator('json', multipartCompleteRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id, parts } = body;
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');

    requireApiKeyPermission(c, 'upload');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    if (record.status === 'completed') {
      const existingFile = await c.env.APP_DB
        .prepare('SELECT id FROM files WHERE upload_id = ? LIMIT 1')
        .bind(upload_id)
        .first<{ id: string }>();
      const response = c.json({
        item: {
          id: upload_id,
          status: 'completed' as const,
          upload_type: 'multipart' as const,
          file_id: existingFile?.id ?? null,
        },
      });
      logV2Request(c, start, { route_family: 'upload', operation: 'multipart_complete' });
      return response;
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
      throw new V2Error('gone', 410, 'Upload session has expired');
    }

    try {
      await completeMultipartUpload(
        c.env,
        record.bucket,
        record.storage_key,
        record.r2_upload_id!,
        parts
      );
    } catch (err) {
      console.error('[multipart/complete] R2 CompleteMultipartUpload failed', err);
      throw new V2Error('conflict', 409, 'Failed to complete multipart upload');
    }

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
      throw new V2Error(
        'conflict',
        409,
        !meta ? 'File not found in storage' : 'File size mismatch'
      );
    }

    const newFileId = crypto.randomUUID();
    let createdFileId: string | null = null;

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
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = promotion.completed ? newFileId : null;

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
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = null;
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'completed' as const,
        upload_type: 'multipart' as const,
        file_id: createdFileId,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_complete' });
    return response;
  }
);

/**
 * R2 Multipart — Abort (AbortMultipartUploadCommand + release quota)
 */
upload.delete(
  '/r2/multipart/abort',
  zValidator('json', multipartAbortRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id } = body;

    requireApiKeyPermission(c, 'upload');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;
    const isMainStorage = record.is_main_storage === 1;

    if (record.status !== 'pending') {
      throw new V2Error('conflict', 409, `Upload is already in state: ${record.status}`);
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

    const response = c.json({
      item: {
        id: upload_id,
        status: 'failed' as const,
        upload_type: 'multipart' as const,
        file_id: null,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_abort' });
    return response;
  }
);

export default upload;
