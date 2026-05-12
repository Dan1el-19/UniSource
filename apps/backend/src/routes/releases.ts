import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  completeRelease,
  createRelease,
  deleteRelease,
  failRelease,
  getLatestRelease,
  getRelease,
  listReleases,
  updateRelease,
  upsertReleaseSync,
} from '../db/releases';
import { buildReleaseStorageKey, getReleaseStoragePrefix, getServiceConfig } from '../config/services';
import { deleteObject, generatePresignedPutUrl, headObject } from '../services/r2';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const RELEASE_UPLOAD_TTL_SECONDS = 3600;
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
