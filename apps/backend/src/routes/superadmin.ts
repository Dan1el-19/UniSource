import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { v2RequestIdGuard } from '../middleware/v2RequestIdGuard';
import { cfAccessMiddleware } from '../middleware/cfAccess';
import { getServiceDetails } from '../db/services';
import {
  createServiceApiKey,
  listServiceApiKeys,
  listServiceApiKeysPage,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  createAccountApiKey,
  listAccountApiKeys,
  listAccountApiKeysPage,
  updateAccountApiKey,
  revokeAccountApiKey,
  getServiceCors,
  replaceServiceCors,
  VALID_PERMISSIONS,
  type Permission,
} from '../db/apiKeys';
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';
import { encodeCursor, decodeCursor } from '../lib/v2/cursor';

const superadmin = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

// Protect all /superadmin/* routes — request ID guard before CF Access
superadmin.use('*', v2RequestIdGuard);
superadmin.use('*', cfAccessMiddleware as never);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const permissionsSchema = z.array(z.enum([...VALID_PERMISSIONS] as [Permission, ...Permission[]])).min(1);

const SUPERADMIN_DEFAULT_LIMIT = 25;
const SUPERADMIN_MAX_LIMIT = 100;

type Page = { limit: number; next_cursor: string | null };

function listResponse<T>(items: T[], page: Page) {
  return { items, page };
}

function itemResponse<T>(item: T) {
  return { item };
}

function cursorSecret(c: { env: CloudflareBindings }): string {
  if (!c.env.CURSOR_HMAC_SECRET) {
    throw new V2Error('internal_error', 500, 'Cursor secret is not configured');
  }
  return c.env.CURSOR_HMAC_SECRET;
}

const SERVICE_SORT_COLUMNS = {
  created_at: 'created_at',
  name: 'name',
} as const;

const listQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value !== undefined ? Number(value) : SUPERADMIN_DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(SUPERADMIN_MAX_LIMIT)),
});

const servicesListQuerySchema = listQuerySchema.extend({
  sort_by: z.enum(['created_at', 'name']).optional().default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).optional().default('asc'),
});

async function readServiceCursor(
  secret: string,
  cursor: string | undefined,
  sort_by: string,
  sort_dir: string,
  fingerprint: string,
) {
  if (!cursor) return null;
  try {
    return await decodeCursor(secret, cursor, {
      sb: sort_by,
      sd: sort_dir as 'asc' | 'desc',
      fp: fingerprint,
    });
  } catch {
    throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
  }
}

// ─── Services ─────────────────────────────────────────────────────────────────

superadmin.get(
  '/services',
  zValidator('query', servicesListQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const query = c.req.valid('query');
    const secret = cursorSecret(c);
    const sortCol = SERVICE_SORT_COLUMNS[query.sort_by];
    const fingerprint = query.sort_by;
    const scursor = await readServiceCursor(secret, query.cursor, query.sort_by, query.sort_dir, fingerprint);

    const where: string[] = [];
    const binds: unknown[] = [];

    if (scursor) {
      if (query.sort_dir === 'desc') {
        where.push(`(${sortCol} < ? OR (${sortCol} = ? AND id < ?))`);
      } else {
        where.push(`(${sortCol} > ? OR (${sortCol} = ? AND id > ?))`);
      }
      binds.push(scursor.lv, scursor.lv, scursor.li);
    }

    let sql = 'SELECT * FROM services';
    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    sql += ` ORDER BY ${sortCol} ${query.sort_dir}, id ${query.sort_dir} LIMIT ?`;
    binds.push(query.limit + 1);

    const { results } = await c.env.APP_DB
      .prepare(sql)
      .bind(...binds)
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

    const rows = results ?? [];
    const pageRows = rows.slice(0, query.limit);
    const items = pageRows.map((s) => ({
      ...s,
      cloudflare_config: s.cloudflare_config ? JSON.parse(s.cloudflare_config) : null,
    }));
    const last = pageRows[pageRows.length - 1];
    const next_cursor = rows.length > query.limit && last
      ? await encodeCursor(secret, { v: 1, sb: query.sort_by, sd: query.sort_dir, lv: last[query.sort_by as 'created_at' | 'name'], li: last.id, fp: fingerprint })
      : null;

    const response = c.json(listResponse(items, { limit: query.limit, next_cursor: next_cursor }));
    logV2Request(c, start, { route_family: 'superadmin', operation: 'list_services' });
    return response;
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

superadmin.post('/services', zValidator('json', createServiceSchema, v2ValidationHook), async (c) => {
  const start = Date.now();
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
      throw new V2Error('conflict', 409, 'Service ID already exists');
    }
    throw e;
  }

  const service = await getServiceDetails(c.env.APP_DB, body.id);
  const response = c.json(itemResponse(service), 201);
  logV2Request(c, start, { route_family: 'superadmin', operation: 'create_service' });
  return response;
});

superadmin.get('/services/:id', async (c) => {
  const start = Date.now();
  const service = await getServiceDetails(c.env.APP_DB, c.req.param('id'));
  if (!service) throw new V2Error('not_found', 404, 'Service not found');
  const response = c.json(itemResponse(service));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'get_service' });
  return response;
});

const patchServiceSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  max_storage_bytes: z.number().int().positive().optional(),
  max_file_size_bytes: z.number().int().positive().optional(),
  recommended_upload_destination: z.enum(['r2', 'appwrite', 'hybrid']).optional(),
  object_key_prefix: z.string().max(64).regex(/^[a-z0-9_/-]*$/).optional(),
});

superadmin.patch('/services/:id', zValidator('json', patchServiceSchema, v2ValidationHook), async (c) => {
  const start = Date.now();
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
    if (!service) throw new V2Error('not_found', 404, 'Service not found');
    const response = c.json(itemResponse(service));
    logV2Request(c, start, { route_family: 'superadmin', operation: 'update_service' });
    return response;
  }

  vals.push(id);
  const result = await c.env.APP_DB
    .prepare(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals)
    .run();

  if ((result.meta.changes ?? 0) === 0) throw new V2Error('not_found', 404, 'Service not found');

  const service = await getServiceDetails(c.env.APP_DB, id);
  const response = c.json(itemResponse(service));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'update_service' });
  return response;
});

superadmin.delete('/services/:id', async (c) => {
  const start = Date.now();
  const id = c.req.param('id');
  const result = await c.env.APP_DB
    .prepare(`DELETE FROM services WHERE id = ?`)
    .bind(id)
    .run();
  if ((result.meta.changes ?? 0) === 0) throw new V2Error('not_found', 404, 'Service not found');
  const response = c.json(itemResponse({ id, deleted: true }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'delete_service' });
  return response;
});

// ─── Service API keys ─────────────────────────────────────────────────────────

const apiKeyListQuery = listQuerySchema;

superadmin.get(
  '/services/:id/api-keys',
  zValidator('query', apiKeyListQuery, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const id = c.req.param('id');
    const query = c.req.valid('query');

    const page = await listServiceApiKeysPage(c.env.APP_DB, id, {
      limit: query.limit,
      cursor: query.cursor,
      cursorSecret: cursorSecret(c),
    });

    const response = c.json(page);
    logV2Request(c, start, { route_family: 'superadmin', operation: 'list_service_api_keys' });
    return response;
  }
);

const createKeySchema = z.object({
  name: z.string().min(1).max(128),
  permissions: permissionsSchema,
  cors_origins: z.array(z.string().url()).optional(),
  expires_at: z.number().int().positive().optional(),
});

superadmin.post('/services/:id/api-keys', zValidator('json', createKeySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const service = await getServiceDetails(c.env.APP_DB, id);
  if (!service) throw new V2Error('not_found', 404, 'Service not found');

  const result = await createServiceApiKey(
    c.env.APP_DB,
    id,
    body.name,
    body.permissions as Permission[],
    body.cors_origins,
    body.expires_at
  );

  const response = c.json(itemResponse(result), 201);
  logV2Request(c, start, { route_family: 'superadmin', operation: 'create_service_api_key' });
  return response;
});

const patchKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  permissions: permissionsSchema.optional(),
});

superadmin.patch('/services/:id/api-keys/:keyId', zValidator('json', patchKeySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const { id, keyId } = c.req.param();
  const body = c.req.valid('json');

  const key = await updateApiKey(c.env.APP_DB, keyId, id, {
    name: body.name,
    permissions: body.permissions as Permission[] | undefined,
  });
  if (!key) throw new V2Error('not_found', 404, 'Key not found or already revoked');
  const response = c.json(itemResponse(key));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'update_service_api_key' });
  return response;
});

superadmin.delete('/services/:id/api-keys/:keyId', async (c) => {
  const start = Date.now();
  const { id, keyId } = c.req.param();
  const revoked = await revokeApiKey(c.env.APP_DB, keyId, id);
  if (!revoked) throw new V2Error('not_found', 404, 'Key not found or already revoked');
  const response = c.json(itemResponse({ id: keyId, revoked: true }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'revoke_service_api_key' });
  return response;
});

superadmin.post('/services/:id/api-keys/:keyId/rotate', async (c) => {
  const start = Date.now();
  const { id, keyId } = c.req.param();
  const result = await rotateApiKey(c.env.APP_DB, keyId, id);
  if (!result) throw new V2Error('not_found', 404, 'Key not found or already revoked');
  const response = c.json(itemResponse(result));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'rotate_service_api_key' });
  return response;
});

// ─── Account-level keys ───────────────────────────────────────────────────────

superadmin.get(
  '/account-keys',
  zValidator('query', apiKeyListQuery, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const query = c.req.valid('query');

    const page = await listAccountApiKeysPage(c.env.APP_DB, {
      limit: query.limit,
      cursor: query.cursor,
      cursorSecret: cursorSecret(c),
    });

    const response = c.json(page);
    logV2Request(c, start, { route_family: 'superadmin', operation: 'list_account_api_keys' });
    return response;
  }
);

const createAccountKeySchema = z.object({
  name: z.string().min(1).max(128),
  permissions: permissionsSchema,
  service_ids: z.array(z.string().min(1)).min(1),
  expires_at: z.number().int().positive().optional(),
});

superadmin.post('/account-keys', zValidator('json', createAccountKeySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const body = c.req.valid('json');
  const result = await createAccountApiKey(
    c.env.APP_DB,
    body.name,
    body.permissions as Permission[],
    body.service_ids,
    body.expires_at
  );
  const response = c.json(itemResponse(result), 201);
  logV2Request(c, start, { route_family: 'superadmin', operation: 'create_account_api_key' });
  return response;
});

const patchAccountKeySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  permissions: permissionsSchema.optional(),
  service_ids: z.array(z.string().min(1)).min(1).optional(),
});

superadmin.patch('/account-keys/:keyId', zValidator('json', patchAccountKeySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const { keyId } = c.req.param();
  const body = c.req.valid('json');
  const key = await updateAccountApiKey(c.env.APP_DB, keyId, {
    name: body.name,
    permissions: body.permissions as Permission[] | undefined,
    service_ids: body.service_ids,
  });
  if (!key) throw new V2Error('not_found', 404, 'Key not found or already revoked');
  const response = c.json(itemResponse(key));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'update_account_api_key' });
  return response;
});

superadmin.delete('/account-keys/:keyId', async (c) => {
  const start = Date.now();
  const keyId = c.req.param('keyId');
  const revoked = await revokeAccountApiKey(c.env.APP_DB, keyId);
  if (!revoked) throw new V2Error('not_found', 404, 'Key not found or already revoked');
  const response = c.json(itemResponse({ id: keyId, revoked: true }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'revoke_account_api_key' });
  return response;
});

// ─── CORS ─────────────────────────────────────────────────────────────────────

superadmin.get('/services/:id/cors', async (c) => {
  const start = Date.now();
  const origins = await getServiceCors(c.env.APP_DB, c.req.param('id'));
  const response = c.json(listResponse(origins, { limit: 100, next_cursor: null }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'get_service_cors' });
  return response;
});

const corsSchema = z.object({
  origins: z.array(z.string().min(1)).max(100),
});

superadmin.put('/services/:id/cors', zValidator('json', corsSchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const id = c.req.param('id');
  const { origins } = c.req.valid('json');

  const service = await getServiceDetails(c.env.APP_DB, id);
  if (!service) throw new V2Error('not_found', 404, 'Service not found');

  await replaceServiceCors(c.env.APP_DB, id, origins);
  const response = c.json(listResponse(origins, { limit: 100, next_cursor: null }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'replace_service_cors' });
  return response;
});

// ─── Cloudflare config ────────────────────────────────────────────────────────

superadmin.get('/services/:id/cloudflare', async (c) => {
  const start = Date.now();
  const row = await c.env.APP_DB
    .prepare(`SELECT cloudflare_config FROM services WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ cloudflare_config: string | null }>();

  if (!row) throw new V2Error('not_found', 404, 'Service not found');
  const response = c.json(itemResponse({ cloudflare_config: row.cloudflare_config ? JSON.parse(row.cloudflare_config) : null }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'get_cloudflare_config' });
  return response;
});

superadmin.patch('/services/:id/cloudflare', async (c) => {
  const start = Date.now();
  const id = c.req.param('id');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new V2Error('validation_error', 400, 'Invalid JSON');
  }

  const result = await c.env.APP_DB
    .prepare(`UPDATE services SET cloudflare_config = ? WHERE id = ?`)
    .bind(JSON.stringify(body), id)
    .run();

  if ((result.meta.changes ?? 0) === 0) throw new V2Error('not_found', 404, 'Service not found');
  const response = c.json(itemResponse({ cloudflare_config: body }));
  logV2Request(c, start, { route_family: 'superadmin', operation: 'update_cloudflare_config' });
  return response;
});

export default superadmin;
