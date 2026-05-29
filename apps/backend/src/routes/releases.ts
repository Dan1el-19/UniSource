import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  completeRelease,
  createMultipartRelease,
  createRelease,
  deleteRelease,
  failRelease,
  getLatestRelease,
  getRelease,
  getReleaseMultipartContext,
  listReleases,
  updateRelease,
  upsertReleaseSync,
} from '../db/releases';
import type { ServiceRecord } from '../db/services';
import { buildReleaseStorageKey, getReleaseStoragePrefix } from '../services/storageKeys';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  generatePresignedPutUrl,
  headObject,
  listUploadedParts,
  signUploadPart,
} from '../services/r2';
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const RELEASE_UPLOAD_TTL_SECONDS = 3600;
const RELEASE_MULTIPART_PART_URL_TTL_SECONDS = 900; // 15 min per part presigned URL
const RELEASES_DEFAULT_LIMIT = 25;
const RELEASES_MAX_LIMIT = 100;

const releases = new Hono<HonoEnv>();

const releaseIdSchema = z.string().trim().min(1).max(128);
const releaseNameSchema = z.string().trim().min(1).max(256);
const releaseTagsSchema = z.array(z.string().trim().min(1).max(64)).max(32).default([]);
const releaseNotesSchema = z.string().trim().max(10_000).nullable().optional();

const uploadInitBodySchema = z.object({
  name: releaseNameSchema,
  filename: z.string().trim().min(1).max(255),
  tags: releaseTagsSchema,
  notes: releaseNotesSchema,
  force_update: z.boolean().default(false),
});

const uploadCompleteBodySchema = z.object({
  release_id: releaseIdSchema,
  size: z.number().int().nonnegative(),
});

const uploadFailBodySchema = z.object({
  release_id: releaseIdSchema,
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RELEASES_MAX_LIMIT).default(RELEASES_DEFAULT_LIMIT),
  cursor: z.string().optional(),
});

const updateBodySchema = z
  .object({
    name: releaseNameSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(32).optional(),
    notes: releaseNotesSchema,
    force_update: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

const syncManifestSchema = z.object({
  id: releaseIdSchema.optional(),
  name: releaseNameSchema,
  r2_key: z.string().trim().min(1).max(1024),
  size: z.number().int().nonnegative(),
  tags: z.array(z.string().trim().min(1).max(64)).max(32).default([]),
  notes: releaseNotesSchema,
  force_update: z.boolean().default(false),
});

const syncBodySchema = z.object({
  releases: z.array(syncManifestSchema).min(1).max(100),
});

// ─── Multipart schemas ────────────────────────────────────────────────────────

const multipartCreateBodySchema = z.object({
  name: releaseNameSchema,
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(255).default('application/octet-stream'),
  tags: releaseTagsSchema,
  notes: releaseNotesSchema,
  force_update: z.boolean().default(false),
});

const multipartSignPartQuerySchema = z.object({
  upload_id: releaseIdSchema,
  part_number: z.coerce.number().int().min(1).max(10_000),
});

const multipartListPartsQuerySchema = z.object({
  upload_id: releaseIdSchema,
});

const multipartCompleteBodySchema = z.object({
  upload_id: releaseIdSchema,
  parts: z
    .array(
      z.object({
        PartNumber: z.number().int().min(1).max(10_000),
        ETag: z.string().trim().min(1),
      })
    )
    .min(1),
});

const multipartAbortBodySchema = z.object({
  upload_id: releaseIdSchema,
});

releases.post('/upload/init', zValidator('json', uploadInitBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const service = c.get('service')!;
  const userId = c.get('userId');

  const body = c.req.valid('json');
  const releaseId = crypto.randomUUID();
  const r2Key = buildReleaseStorageKey(service.object_key_prefix, body.filename);
  const { presigned_url, expires_at } = await generatePresignedPutUrl(
    c.env,
    service.default_bucket,
    r2Key,
    'application/octet-stream',
    RELEASE_UPLOAD_TTL_SECONDS
  );

  const release = await createRelease(c.env.APP_DB, {
    id: releaseId,
    service_id: service.id,
    name: body.name,
    size: 0,
    r2_key: r2Key,
    tags: body.tags,
    notes: body.notes ?? null,
    force_update: body.force_update,
    uploaded_by: userId,
    presigned_url,
    presigned_expires_at: expires_at,
  });

  const response = c.json(
    {
      item: {
        release_id: release.id,
        presigned_url,
        r2_key: r2Key,
        expires_at,
      },
    },
    201
  );
  logV2Request(c, start, { route_family: 'releases', operation: 'upload_init' });
  return response;
});

releases.post('/upload/complete', zValidator('json', uploadCompleteBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const service = c.get('service')!;
  const { release_id, size } = c.req.valid('json');
  const release = await getRelease(c.env.APP_DB, release_id, service.id);

  if (!release) {
    throw new V2Error('not_found', 404, 'Release not found');
  }

  if (release.upload_status === 'completed') {
    const response = c.json({ item: { id: release_id, status: 'completed' as const } });
    logV2Request(c, start, { route_family: 'releases', operation: 'upload_complete' });
    return response;
  }

  const meta = await headObject(c.env, service.default_bucket, release.r2_key);
  if (!meta) {
    await failRelease(c.env.APP_DB, release_id);
    throw new V2Error('conflict', 409, 'Release object not found in storage');
  }

  if (meta.size !== size) {
    await failRelease(c.env.APP_DB, release_id);
    throw new V2Error('conflict', 409, 'Release object size mismatch');
  }

  const completed = await completeRelease(c.env.APP_DB, release_id);
  if (!completed) {
    throw new V2Error('conflict', 409, 'Release could not be completed — it may have been cancelled');
  }

  await updateRelease(c.env.APP_DB, release_id, service.id, { size });
  const response = c.json({ item: { id: release_id, status: 'completed' as const } });
  logV2Request(c, start, { route_family: 'releases', operation: 'upload_complete' });
  return response;
});

releases.post('/upload/fail', zValidator('json', uploadFailBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const service = c.get('service')!;
  const { release_id } = c.req.valid('json');
  const release = await getRelease(c.env.APP_DB, release_id, service.id);

  if (!release) {
    throw new V2Error('not_found', 404, 'Release not found');
  }

  if (release.upload_status === 'failed') {
    const response = c.json({ item: { id: release_id, status: 'failed' as const } });
    logV2Request(c, start, { route_family: 'releases', operation: 'upload_fail' });
    return response;
  }

  if (release.upload_status !== 'pending') {
    throw new V2Error('conflict', 409, `Release is already in state: ${release.upload_status}`);
  }

  const failed = await failRelease(c.env.APP_DB, release_id);
  if (!failed) {
    const current = await getRelease(c.env.APP_DB, release_id, service.id);
    if (!current) {
      throw new V2Error('not_found', 404, 'Release not found');
    }
    if (current.upload_status === 'failed') {
      const response = c.json({ item: { id: release_id, status: 'failed' as const } });
      logV2Request(c, start, { route_family: 'releases', operation: 'upload_fail' });
      return response;
    }
    throw new V2Error('conflict', 409, `Release is already in state: ${current.upload_status}`);
  }

  const response = c.json({ item: { id: release_id, status: 'failed' as const } });
  logV2Request(c, start, { route_family: 'releases', operation: 'upload_fail' });
  return response;
});

// ─── Multipart Upload ─────────────────────────────────────────────────────────

/**
 * Resolves the multipart context for a release and validates ownership/state
 * before any sign/list/complete/abort operation.
 */
async function getOwnedMultipartRelease(
  c: { env: CloudflareBindings; get: (k: 'service') => ServiceRecord },
  uploadId: string
) {
  const service = c.get('service');
  const ctx = await getReleaseMultipartContext(c.env.APP_DB, uploadId, service.id);
  if (!ctx) return { error: 'not_found' as const };
  return { ctx };
}

/**
 * POST /releases/upload/multipart/create
 * Reserves a release_id + r2_key in D1 and starts the S3 multipart upload.
 * Returns the R2 UploadId together with the storage key — subsequent
 * sign/list/complete/abort calls reference the upload via release_id.
 */
releases.post(
  '/upload/multipart/create',
  zValidator('json', multipartCreateBodySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const service = c.get('service')!;
    const userId = c.get('userId');

    const body = c.req.valid('json');
    const releaseId = crypto.randomUUID();
    const r2Key = buildReleaseStorageKey(service.object_key_prefix, body.filename);

    let r2UploadId: string;
    try {
      const result = await createMultipartUpload(c.env, service.default_bucket, r2Key, body.mime_type);
      r2UploadId = result.upload_id;
    } catch (err) {
      console.error('[releases.multipart/create] R2 CreateMultipartUpload failed', err);
      throw new V2Error('bad_gateway', 502, 'Failed to start multipart upload');
    }

    try {
      await createMultipartRelease(c.env.APP_DB, {
        id: releaseId,
        service_id: service.id,
        name: body.name,
        r2_key: r2Key,
        tags: body.tags,
        notes: body.notes ?? null,
        force_update: body.force_update,
        uploaded_by: userId,
        r2_upload_id: r2UploadId,
      });
    } catch (err) {
      await abortMultipartUpload(c.env, service.default_bucket, r2Key, r2UploadId).catch(() => undefined);
      throw err;
    }

    const expires_at = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    const response = c.json(
      {
        item: {
          upload_id: releaseId,
          r2_upload_id: r2UploadId,
          key: r2Key,
          bucket: service.default_bucket,
          expires_at,
        },
      },
      201
    );
    logV2Request(c, start, { route_family: 'releases', operation: 'multipart_create' });
    return response;
  }
);

/**
 * GET /releases/upload/multipart/sign-part
 * Returns a short-lived presigned PUT URL for a single part of an
 * in-flight multipart release upload.
 */
releases.get(
  '/upload/multipart/sign-part',
  zValidator('query', multipartSignPartQuerySchema, v2ValidationHook),
  async (c) => {
    const { upload_id, part_number } = c.req.valid('query');
    const service = c.get('service')!;

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      throw new V2Error('not_found', 404, 'Release upload not found');
    }
    const { ctx } = result;

    if (ctx.upload_status !== 'pending') {
      throw new V2Error('conflict', 409, `Release is in state: ${ctx.upload_status}`);
    }

    const signed = await signUploadPart(
      c.env,
      service.default_bucket,
      ctx.r2_key,
      ctx.r2_upload_id,
      part_number,
      RELEASE_MULTIPART_PART_URL_TTL_SECONDS
    );

    return c.json({ item: { url: signed.url, expires_at: signed.expires_at } });
  }
);

/**
 * GET /releases/upload/multipart/list-parts
 * Lists parts already uploaded against the release's R2 multipart upload —
 * used by Uppy's Golden Retriever to resume after a reload.
 */
releases.get(
  '/upload/multipart/list-parts',
  zValidator('query', multipartListPartsQuerySchema, v2ValidationHook),
  async (c) => {
    const { upload_id } = c.req.valid('query');
    const service = c.get('service')!;

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      throw new V2Error('not_found', 404, 'Release upload not found');
    }
    const { ctx } = result;

    const parts = await listUploadedParts(
      c.env,
      service.default_bucket,
      ctx.r2_key,
      ctx.r2_upload_id
    );

    return c.json({
      items: parts,
      page: { limit: 1000, next_cursor: null as string | null },
    });
  }
);

/**
 * POST /releases/upload/multipart/complete
 * Stitches the parts together via R2 CompleteMultipartUpload and marks the
 * release as completed. The size on the resulting object becomes the release
 * size (no client-supplied size).
 */
releases.post(
  '/upload/multipart/complete',
  zValidator('json', multipartCompleteBodySchema, v2ValidationHook),
  async (c) => {
    const { upload_id, parts } = c.req.valid('json');
    const service = c.get('service')!;

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      throw new V2Error('not_found', 404, 'Release upload not found');
    }
    const { ctx } = result;

    if (ctx.upload_status === 'completed') {
      return c.json({ item: { id: upload_id, status: 'completed' as const } });
    }
    if (ctx.upload_status !== 'pending') {
      throw new V2Error('conflict', 409, `Release is in state: ${ctx.upload_status}`);
    }

    try {
      await completeMultipartUpload(
        c.env,
        service.default_bucket,
        ctx.r2_key,
        ctx.r2_upload_id,
        parts
      );
    } catch (err) {
      console.error('[releases.multipart/complete] CompleteMultipartUpload failed', err);
      throw new V2Error('conflict', 409, 'Failed to complete multipart upload');
    }

    const meta = await headObject(c.env, service.default_bucket, ctx.r2_key);
    if (!meta) {
      await failRelease(c.env.APP_DB, upload_id);
      throw new V2Error('conflict', 409, 'Release object not found in storage');
    }

    const completed = await completeRelease(c.env.APP_DB, upload_id);
    if (!completed) {
      const refreshed = await getRelease(c.env.APP_DB, upload_id, service.id);
      if (refreshed?.upload_status === 'completed') {
        return c.json({ item: { id: upload_id, status: 'completed' as const } });
      }
      throw new V2Error('conflict', 409, 'Release could not be completed — it may have been cancelled');
    }

    await updateRelease(c.env.APP_DB, upload_id, service.id, { size: meta.size });
    return c.json({ item: { id: upload_id, status: 'completed' as const } });
  }
);

/**
 * DELETE /releases/upload/multipart/abort
 * Aborts an in-flight multipart upload and marks the release as failed.
 */
releases.delete(
  '/upload/multipart/abort',
  zValidator('json', multipartAbortBodySchema, v2ValidationHook),
  async (c) => {
    const { upload_id } = c.req.valid('json');
    const service = c.get('service')!;

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      throw new V2Error('not_found', 404, 'Release upload not found');
    }
    const { ctx } = result;

    if (ctx.upload_status === 'failed') {
      return c.json({ item: { id: upload_id, status: 'failed' as const } });
    }
    if (ctx.upload_status !== 'pending') {
      throw new V2Error('conflict', 409, `Release is already in state: ${ctx.upload_status}`);
    }

    await abortMultipartUpload(
      c.env,
      service.default_bucket,
      ctx.r2_key,
      ctx.r2_upload_id
    ).catch(() => undefined);

    await failRelease(c.env.APP_DB, upload_id);

    return c.json({ item: { id: upload_id, status: 'failed' as const } });
  }
);

releases.get('/latest', async (c) => {
  const service = c.get('service')!;
  const release = await getLatestRelease(c.env.APP_DB, service.id);
  if (!release) {
    throw new V2Error('not_found', 404, 'No completed release found');
  }
  return c.json({ item: release });
});

releases.get('/', zValidator('query', listQuerySchema, v2ValidationHook), async (c) => {
  const service = c.get('service')!;
  const query = c.req.valid('query');
  try {
    const result = await listReleases(c.env.APP_DB, service.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return c.json({
      items: result.items,
      page: { limit: query.limit, next_cursor: result.next_cursor },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
    }
    throw err;
  }
});

releases.get('/:id', async (c) => {
  const service = c.get('service')!;
  const release = await getRelease(c.env.APP_DB, c.req.param('id'), service.id);
  if (!release) {
    throw new V2Error('not_found', 404, 'Release not found');
  }
  return c.json({ item: release });
});

releases.patch('/:id', zValidator('json', updateBodySchema, v2ValidationHook), async (c) => {
  const service = c.get('service')!;
  const updated = await updateRelease(c.env.APP_DB, c.req.param('id'), service.id, c.req.valid('json'));
  if (!updated) {
    throw new V2Error('not_found', 404, 'Release not found');
  }
  return c.json({ item: updated });
});

releases.delete('/:id', async (c) => {
  const service = c.get('service')!;
  const releaseId = c.req.param('id');
  const release = await getRelease(c.env.APP_DB, releaseId, service.id);

  if (!release) {
    throw new V2Error('not_found', 404, 'Release not found');
  }

  if (release.upload_status === 'completed') {
    await deleteObject(c.env, service.default_bucket, release.r2_key);
  }

  await deleteRelease(c.env.APP_DB, releaseId, service.id);
  return c.json({ item: { id: releaseId, deleted: true as const } });
});

releases.post('/sync', zValidator('json', syncBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const service = c.get('service')!;
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const storagePrefix = getReleaseStoragePrefix(service.object_key_prefix);

  const processed: string[] = [];
  const failed: Array<{ id: string; code: 'validation_error' | 'internal_error'; message: string }> = [];

  for (const manifest of body.releases) {
    const releaseId = manifest.id ?? crypto.randomUUID();

    if (!manifest.r2_key.startsWith(storagePrefix)) {
      failed.push({
        id: releaseId,
        code: 'validation_error',
        message: `r2_key must start with ${storagePrefix}`,
      });
      continue;
    }
    const suffix = manifest.r2_key.slice(storagePrefix.length);
    if (suffix.length === 0 || suffix.includes('..') || suffix.startsWith('/')) {
      failed.push({
        id: releaseId,
        code: 'validation_error',
        message: 'r2_key has invalid suffix',
      });
      continue;
    }

    try {
      await upsertReleaseSync(c.env.APP_DB, {
        id: releaseId,
        service_id: service.id,
        name: manifest.name,
        size: manifest.size,
        r2_key: manifest.r2_key,
        tags: manifest.tags,
        notes: manifest.notes ?? null,
        force_update: manifest.force_update,
        uploaded_by: userId,
        presigned_url: '',
        presigned_expires_at: Math.floor(Date.now() / 1000),
      });
      await completeRelease(c.env.APP_DB, releaseId);
      processed.push(releaseId);
    } catch {
      failed.push({ id: releaseId, code: 'internal_error', message: 'Release sync failed' });
    }
  }

  const response = c.json({ processed, failed });
  logV2Request(c, start, { route_family: 'releases', operation: 'sync' });
  return response;
});

export default releases;
