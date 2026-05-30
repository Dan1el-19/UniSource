import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { cfAccessMiddleware } from '../middleware/cfAccess';
import { getServiceDetails } from '../db/services';
import {
  createServiceApiKey,
  listServiceApiKeys,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  createAccountApiKey,
  listAccountApiKeys,
  updateAccountApiKey,
  revokeAccountApiKey,
  getServiceCors,
  replaceServiceCors,
  VALID_PERMISSIONS,
  type Permission,
} from '../db/apiKeys';

const superadmin = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

// Protect all /superadmin/* routes with CF Access
superadmin.use('*', cfAccessMiddleware as never);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const permissionsSchema = z.array(z.enum([...VALID_PERMISSIONS] as [Permission, ...Permission[]])).min(1);

// ─── Services ─────────────────────────────────────────────────────────────────

superadmin.get('/services', async (c) => {
  const { results } = await c.env.APP_DB
    .prepare(`SELECT * FROM services ORDER BY created_at ASC`)
    .all<{
      id: string;
      name: string;
      default_bucket: string;
      max_storage_bytes: number;
      current_used_bytes: number;
      main_used_bytes: number;
      max_file_size_bytes: number;
      recommended_upload_destination: string;
      object_key_prefix: string;
      cloudflare_config: string | null;
      created_at: number;
    }>();

  return c.json({
    services: results.map((s) => ({
      ...s,
      cloudflare_config: s.cloudflare_config ? JSON.parse(s.cloudflare_config) : null,
    })),
  });
});

const createServiceSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(128),
  default_bucket: z.string().min(1).max(128),
  max_storage_bytes: z.number().int().positive(),
  max_file_size_bytes: z.number().int().positive(),
  recommended_upload_destination: z.enum(['r2', 'appwrite', 'hybrid']).optional().default('r2'),
  object_key_prefix: z.string().max(64).regex(/^[a-z0-9_/-]*$/).optional().default(''),
});

superadmin.post('/services', zValidator('json', createServiceSchema), async (c) => {
  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  try {
    await c.env.APP_DB
      .prepare(
        `INSERT INTO services (id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes, max_file_size_bytes, recommended_upload_destination, object_key_prefix, created_at)
         VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`
      )
      .bind(body.id, body.name, body.default_bucket, body.max_storage_bytes, body.max_file_size_bytes, body.recommended_upload_destination, body.object_key_prefix, now)
      .run();
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('UNIQUE')) {
      return c.json({ error: 'Service ID already exists' }, 409);
    }
    throw e;
  }

  const service = await getServiceDetails(c.env.APP_DB, body.id);
  return c.json({ service }, 201);
});

superadmin.get('/services/:id', async (c) => {
  const service = await getServiceDetails(c.env.APP_DB, c.req.param('id'));
  if (!service) return c.json({ error: 'Not found' }, 404);
  return c.json({ service });
});

const patchServiceSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  max_storage_bytes: z.number().int().positive().optional(),
  max_file_size_bytes: z.number().int().positive().optional(),
  recommended_upload_destination: z.enum(['r2', 'appwrite', 'hybrid']).optional(),
  object_key_prefix: z.string().max(64).regex(/^[a-z0-9_/-]*$/).optional(),
});

superadmin.patch('/services/:id', zValidator('json', patchServiceSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const sets: string[] = [];
  const vals: unknown[] = [];

  if (body.name !== undefined) { sets.push('name = ?'); vals.push(body.name); }
  if (body.max_storage_bytes !== undefined) { sets.push('max_storage_bytes = ?'); vals.push(body.max_storage_bytes); }
  if (body.max_file_size_bytes !== undefined) { sets.push('max_file_size_bytes = ?'); vals.push(body.max_file_size_bytes); }
  if (body.recommended_upload_destination !== undefined) { sets.push('recommended_upload_destination = ?'); vals.push(body.recommended_upload_destination); }
  if (body.object_key_prefix !== undefined) { sets.push('object_key_prefix = ?'); vals.push(body.object_key_prefix); }

  if (sets.length === 0) {
    const service = await getServiceDetails(c.env.APP_DB, id);
    if (!service) return c.json({ error: 'Not found' }, 404);
    return c.json({ service });
  }

  vals.push(id);
  const result = await c.env.APP_DB
    .prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();

  if ((result.meta.changes ?? 0) === 0) return c.json({ error: 'Not found' }, 404);

  const service = await getServiceDetails(c.env.APP_DB, id);
  return c.json({ service });
});

superadmin.delete('/services/:id', async (c) => {
  const id = c.req.param('id');
  const result = await c.env.APP_DB
    .prepare(`DELETE FROM services WHERE id = ?`)
    .bind(id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ deleted: true });
});

// ─── Service API keys ─────────────────────────────────────────────────────────

superadmin.get('/services/:id/api-keys', async (c) => {
  const keys = await listServiceApiKeys(c.env.APP_DB, c.req.param('id'));
  return c.json({ keys });
});

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  permissions: permissionsSchema,
  cors_origins: z.array(z.string().url()).optional(),
  expires_at: z.number().int().positive().optional(),
});

superadmin.post('/services/:id/api-keys', zValidator('json', createKeySchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const service = await getServiceDetails(c.env.APP_DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);

  const result = await createServiceApiKey(
    c.env.APP_DB,
    id,
    body.name,
    body.permissions as Permission[],
    body.cors_origins,
    body.expires_at
  );

  return c.json({ key: result }, 201);
});

const patchKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  permissions: permissionsSchema.optional(),
});

superadmin.patch('/services/:id/api-keys/:keyId', zValidator('json', patchKeySchema), async (c) => {
  const { id, keyId } = c.req.param();
  const body = c.req.valid('json');

  const key = await updateApiKey(c.env.APP_DB, keyId, id, {
    name: body.name,
    permissions: body.permissions as Permission[] | undefined,
  });
  if (!key) return c.json({ error: 'Key not found or already revoked' }, 404);
  return c.json({ key });
});

superadmin.delete('/services/:id/api-keys/:keyId', async (c) => {
  const { id, keyId } = c.req.param();
  const revoked = await revokeApiKey(c.env.APP_DB, keyId, id);
  if (!revoked) return c.json({ error: 'Key not found or already revoked' }, 404);
  return c.json({ revoked: true });
});

superadmin.post('/services/:id/api-keys/:keyId/rotate', async (c) => {
  const { id, keyId } = c.req.param();
  const result = await rotateApiKey(c.env.APP_DB, keyId, id);
  if (!result) return c.json({ error: 'Key not found or already revoked' }, 404);
  return c.json({ key: result });
});

// ─── Account-level keys ───────────────────────────────────────────────────────

superadmin.get('/account-keys', async (c) => {
  const keys = await listAccountApiKeys(c.env.APP_DB);
  return c.json({ keys });
});

const createAccountKeySchema = z.object({
  name: z.string().min(1).max(128),
  permissions: permissionsSchema,
  service_ids: z.array(z.string().min(1)).min(1),
  expires_at: z.number().int().positive().optional(),
});

superadmin.post('/account-keys', zValidator('json', createAccountKeySchema), async (c) => {
  const body = c.req.valid('json');
  const result = await createAccountApiKey(
    c.env.APP_DB,
    body.name,
    body.permissions as Permission[],
    body.service_ids,
    body.expires_at
  );
  return c.json({ key: result }, 201);
});

const patchAccountKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  permissions: permissionsSchema.optional(),
  service_ids: z.array(z.string().min(1)).min(1).optional(),
});

superadmin.patch('/account-keys/:keyId', zValidator('json', patchAccountKeySchema), async (c) => {
  const { keyId } = c.req.param();
  const body = c.req.valid('json');
  const key = await updateAccountApiKey(c.env.APP_DB, keyId, {
    name: body.name,
    permissions: body.permissions as Permission[] | undefined,
    service_ids: body.service_ids,
  });
  if (!key) return c.json({ error: 'Key not found or already revoked' }, 404);
  return c.json({ key });
});

superadmin.delete('/account-keys/:keyId', async (c) => {
  const revoked = await revokeAccountApiKey(c.env.APP_DB, c.req.param('keyId'));
  if (!revoked) return c.json({ error: 'Key not found or already revoked' }, 404);
  return c.json({ revoked: true });
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

superadmin.get('/services/:id/cors', async (c) => {
  const origins = await getServiceCors(c.env.APP_DB, c.req.param('id'));
  return c.json({ origins });
});

const corsSchema = z.object({
  origins: z.array(z.string().min(1)).max(100),
});

superadmin.put('/services/:id/cors', zValidator('json', corsSchema), async (c) => {
  const id = c.req.param('id');
  const { origins } = c.req.valid('json');

  const service = await getServiceDetails(c.env.APP_DB, id);
  if (!service) return c.json({ error: 'Service not found' }, 404);

  await replaceServiceCors(c.env.APP_DB, id, origins);
  return c.json({ origins });
});

// ─── Cloudflare config ────────────────────────────────────────────────────────

superadmin.get('/services/:id/cloudflare', async (c) => {
  const row = await c.env.APP_DB
    .prepare(`SELECT cloudflare_config FROM services WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ cloudflare_config: string | null }>();

  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ cloudflare_config: row.cloudflare_config ? JSON.parse(row.cloudflare_config) : null });
});

superadmin.patch('/services/:id/cloudflare', async (c) => {
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const result = await c.env.APP_DB
    .prepare(`UPDATE services SET cloudflare_config = ? WHERE id = ?`)
    .bind(JSON.stringify(body), id)
    .run();

  if ((result.meta.changes ?? 0) === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ cloudflare_config: body });
});

export default superadmin;
