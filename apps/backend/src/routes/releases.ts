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
import { buildReleaseStorageKey, getReleaseStoragePrefix, getServiceConfig } from '../config/services';
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

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const RELEASE_UPLOAD_TTL_SECONDS = 3600;
const RELEASE_MULTIPART_PART_URL_TTL_SECONDS = 900; // 15 min per part presigned URL
const RELEASES_DEFAULT_LIMIT = 25;
const RELEASES_MAX_LIMIT = 100;

const releases = new Hono<HonoEnv>();

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

releases.post('/upload/init', zValidator('json', uploadInitBodySchema, validationErrorHook), async (c) => {
  const serviceId = c.get('serviceId');
  const userId = c.get('userId');
  const svcConfig = getServiceConfig(serviceId);
  if (!svcConfig) {
    return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
  }

  const body = c.req.valid('json');
  const releaseId = crypto.randomUUID();
  const r2Key = buildReleaseStorageKey(serviceId, body.filename);
  const { presigned_url, expires_at } = await generatePresignedPutUrl(
    c.env,
    svcConfig.bucketName,
    r2Key,
    'application/octet-stream',
    RELEASE_UPLOAD_TTL_SECONDS
  );

  const release = await createRelease(c.env.APP_DB, {
    id: releaseId,
    service_id: serviceId,
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

  return c.json(
    {
      release_id: release.id,
      presigned_url,
      r2_key: r2Key,
      expires_at,
    },
    201
  );
});

releases.post('/upload/complete', zValidator('json', uploadCompleteBodySchema, validationErrorHook), async (c) => {
  const serviceId = c.get('serviceId');
  const { release_id, size } = c.req.valid('json');
  const release = await getRelease(c.env.APP_DB, release_id, serviceId);

  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }

  if (release.upload_status === 'completed') {
    return c.json({ success: true, release_id, status: 'completed' });
  }

  const svcConfig = getServiceConfig(serviceId);
  if (!svcConfig) {
    return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
  }

  const meta = await headObject(c.env, svcConfig.bucketName, release.r2_key);
  if (!meta) {
    await failRelease(c.env.APP_DB, release_id);
    return c.json({ error: 'Conflict', message: 'Release object not found in storage' }, 409);
  }

  if (meta.size !== size) {
    await failRelease(c.env.APP_DB, release_id);
    return c.json({ error: 'Conflict', message: 'Release object size mismatch' }, 409);
  }

  const completed = await completeRelease(c.env.APP_DB, release_id);
  if (!completed) {
    return c.json({ error: 'Conflict', message: 'Release could not be completed — it may have been cancelled' }, 409);
  }

  await updateRelease(c.env.APP_DB, release_id, serviceId, { size });
  return c.json({ success: true, release_id, status: 'completed' });
});

releases.post('/upload/fail', zValidator('json', uploadFailBodySchema, validationErrorHook), async (c) => {
  const serviceId = c.get('serviceId');
  const { release_id } = c.req.valid('json');
  const release = await getRelease(c.env.APP_DB, release_id, serviceId);

  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }

  if (release.upload_status === 'failed') {
    return c.json({ success: true, release_id, status: 'failed' });
  }

  if (release.upload_status !== 'pending') {
    return c.json({ error: 'Conflict', message: `Release is already in state: ${release.upload_status}` }, 409);
  }

  const failed = await failRelease(c.env.APP_DB, release_id);
  if (!failed) {
    const current = await getRelease(c.env.APP_DB, release_id, serviceId);
    if (!current) {
      return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
    }
    if (current.upload_status === 'failed') {
      return c.json({ success: true, release_id, status: 'failed' });
    }
    return c.json({ error: 'Conflict', message: `Release is already in state: ${current.upload_status}` }, 409);
  }

  return c.json({ success: true, release_id, status: 'failed' });
});

// ─── Multipart Upload ─────────────────────────────────────────────────────────

/**
 * Resolves the multipart context for a release and validates ownership/state
 * before any sign/list/complete/abort operation.
 */
async function getOwnedMultipartRelease(
  c: { env: CloudflareBindings; get: (k: 'serviceId') => string },
  uploadId: string
) {
  const serviceId = c.get('serviceId');
  const ctx = await getReleaseMultipartContext(c.env.APP_DB, uploadId, serviceId);
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
  zValidator('json', multipartCreateBodySchema, validationErrorHook),
  async (c) => {
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    const body = c.req.valid('json');
    const releaseId = crypto.randomUUID();
    const r2Key = buildReleaseStorageKey(serviceId, body.filename);

    let r2UploadId: string;
    try {
      const result = await createMultipartUpload(c.env, svcConfig.bucketName, r2Key, body.mime_type);
      r2UploadId = result.upload_id;
    } catch (err) {
      return c.json(
        {
          error: 'Bad Gateway',
          message: `Failed to start multipart upload on R2: ${(err as Error).message}`,
        },
        502
      );
    }

    try {
      await createMultipartRelease(c.env.APP_DB, {
        id: releaseId,
        service_id: serviceId,
        name: body.name,
        r2_key: r2Key,
        tags: body.tags,
        notes: body.notes ?? null,
        force_update: body.force_update,
        uploaded_by: userId,
        r2_upload_id: r2UploadId,
      });
    } catch (err) {
      // Release the orphaned R2 multipart upload if D1 insert fails.
      await abortMultipartUpload(c.env, svcConfig.bucketName, r2Key, r2UploadId).catch(() => undefined);
      throw err;
    }

    // R2 auto-aborts multipart uploads after 7 days; mirror the limit.
    const expires_at = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    return c.json(
      {
        upload_id: releaseId,
        r2_upload_id: r2UploadId,
        key: r2Key,
        bucket: svcConfig.bucketName,
        expires_at,
      },
      201
    );
  }
);

/**
 * GET /releases/upload/multipart/sign-part
 * Returns a short-lived presigned PUT URL for a single part of an
 * in-flight multipart release upload.
 */
releases.get(
  '/upload/multipart/sign-part',
  zValidator('query', multipartSignPartQuerySchema, validationErrorHook),
  async (c) => {
    const { upload_id, part_number } = c.req.valid('query');
    const serviceId = c.get('serviceId');

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      return c.json({ error: 'Not Found', message: 'Release upload not found' }, 404);
    }
    const { ctx } = result;

    if (ctx.upload_status !== 'pending') {
      return c.json({ error: 'Conflict', message: `Release is in state: ${ctx.upload_status}` }, 409);
    }

    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    const signed = await signUploadPart(
      c.env,
      svcConfig.bucketName,
      ctx.r2_key,
      ctx.r2_upload_id,
      part_number,
      RELEASE_MULTIPART_PART_URL_TTL_SECONDS
    );

    return c.json({ url: signed.url, expires_at: signed.expires_at });
  }
);

/**
 * GET /releases/upload/multipart/list-parts
 * Lists parts already uploaded against the release's R2 multipart upload —
 * used by Uppy's Golden Retriever to resume after a reload.
 */
releases.get(
  '/upload/multipart/list-parts',
  zValidator('query', multipartListPartsQuerySchema, validationErrorHook),
  async (c) => {
    const { upload_id } = c.req.valid('query');
    const serviceId = c.get('serviceId');

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      return c.json({ error: 'Not Found', message: 'Release upload not found' }, 404);
    }
    const { ctx } = result;

    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    const parts = await listUploadedParts(
      c.env,
      svcConfig.bucketName,
      ctx.r2_key,
      ctx.r2_upload_id
    );

    return c.json({ parts });
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
  zValidator('json', multipartCompleteBodySchema, validationErrorHook),
  async (c) => {
    const { upload_id, parts } = c.req.valid('json');
    const serviceId = c.get('serviceId');

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      return c.json({ error: 'Not Found', message: 'Release upload not found' }, 404);
    }
    const { ctx } = result;

    if (ctx.upload_status === 'completed') {
      return c.json({ success: true, release_id: upload_id, status: 'completed' });
    }
    if (ctx.upload_status !== 'pending') {
      return c.json({ error: 'Conflict', message: `Release is in state: ${ctx.upload_status}` }, 409);
    }

    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    try {
      await completeMultipartUpload(
        c.env,
        svcConfig.bucketName,
        ctx.r2_key,
        ctx.r2_upload_id,
        parts
      );
    } catch (err) {
      return c.json(
        { error: 'Conflict', message: `Failed to complete multipart upload: ${(err as Error).message}` },
        409
      );
    }

    const meta = await headObject(c.env, svcConfig.bucketName, ctx.r2_key);
    if (!meta) {
      await failRelease(c.env.APP_DB, upload_id);
      return c.json({ error: 'Conflict', message: 'Release object not found in storage' }, 409);
    }

    const completed = await completeRelease(c.env.APP_DB, upload_id);
    if (!completed) {
      const refreshed = await getRelease(c.env.APP_DB, upload_id, serviceId);
      if (refreshed?.upload_status === 'completed') {
        return c.json({ success: true, release_id: upload_id, status: 'completed' });
      }
      return c.json(
        { error: 'Conflict', message: 'Release could not be completed — it may have been cancelled' },
        409
      );
    }

    await updateRelease(c.env.APP_DB, upload_id, serviceId, { size: meta.size });
    return c.json({ success: true, release_id: upload_id, status: 'completed' });
  }
);

/**
 * DELETE /releases/upload/multipart/abort
 * Aborts an in-flight multipart upload and marks the release as failed.
 */
releases.delete(
  '/upload/multipart/abort',
  zValidator('json', multipartAbortBodySchema, validationErrorHook),
  async (c) => {
    const { upload_id } = c.req.valid('json');
    const serviceId = c.get('serviceId');

    const result = await getOwnedMultipartRelease(c, upload_id);
    if ('error' in result) {
      return c.json({ error: 'Not Found', message: 'Release upload not found' }, 404);
    }
    const { ctx } = result;

    if (ctx.upload_status === 'failed') {
      return c.json({ success: true, release_id: upload_id, status: 'failed' });
    }
    if (ctx.upload_status !== 'pending') {
      return c.json({ error: 'Conflict', message: `Release is already in state: ${ctx.upload_status}` }, 409);
    }

    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }

    await abortMultipartUpload(
      c.env,
      svcConfig.bucketName,
      ctx.r2_key,
      ctx.r2_upload_id
    ).catch(() => undefined);

    await failRelease(c.env.APP_DB, upload_id);

    return c.json({ success: true, release_id: upload_id, status: 'failed' });
  }
);

releases.get('/latest', async (c) => {
  const release = await getLatestRelease(c.env.APP_DB, c.get('serviceId'));
  if (!release) {
    return c.json({ error: 'Not Found', message: 'No completed release found' }, 404);
  }
  return c.json(release);
});

releases.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const query = c.req.valid('query');
  const result = await listReleases(c.env.APP_DB, c.get('serviceId'), {
    limit: query.limit,
    cursor: query.cursor,
  });
  return c.json(result);
});

releases.get('/:id', async (c) => {
  const release = await getRelease(c.env.APP_DB, c.req.param('id'), c.get('serviceId'));
  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }
  return c.json(release);
});

releases.patch('/:id', zValidator('json', updateBodySchema, validationErrorHook), async (c) => {
  const updated = await updateRelease(c.env.APP_DB, c.req.param('id'), c.get('serviceId'), c.req.valid('json'));
  if (!updated) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }
  return c.json(updated);
});

releases.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const releaseId = c.req.param('id');
  const release = await getRelease(c.env.APP_DB, releaseId, serviceId);

  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }

  if (release.upload_status === 'completed') {
    const svcConfig = getServiceConfig(serviceId);
    if (!svcConfig) {
      return c.json({ error: 'Not Found', message: 'Service not found' }, 404);
    }
    await deleteObject(c.env, svcConfig.bucketName, release.r2_key);
  }

  await deleteRelease(c.env.APP_DB, releaseId, serviceId);
  return c.json({ success: true, release_id: releaseId });
});

releases.post('/sync', zValidator('json', syncBodySchema, validationErrorHook), async (c) => {
  const serviceId = c.get('serviceId');
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const storagePrefix = getReleaseStoragePrefix(serviceId);
  const results = [];

  for (const manifest of body.releases) {
    if (!manifest.r2_key.startsWith(storagePrefix)) {
      return c.json({ error: 'Bad Request', message: `r2_key must start with ${storagePrefix}` }, 400);
    }
  }

  for (const manifest of body.releases) {
    const releaseId = manifest.id ?? crypto.randomUUID();
    await upsertReleaseSync(c.env.APP_DB, {
      id: releaseId,
      service_id: serviceId,
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
    results.push({ release_id: releaseId, success: true, status: 'completed' });
  }

  return c.json({ synced: results.length, results });
});

export default releases;
