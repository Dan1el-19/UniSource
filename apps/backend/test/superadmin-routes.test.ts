import { Hono } from 'hono';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import superadmin from '../src/routes/superadmin';
import { V2Error, errorResponse } from '../src/lib/v2/errors';
import { createServiceApiKey, createAccountApiKey } from '../src/db/apiKeys';

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

const TEST_TIMEOUT = 15000;
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!';

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.route('/superadmin', superadmin);
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err);
    throw err;
  });
  return app;
}

function testEnv(overrides: Partial<CloudflareBindings & Record<string, string>> = {}) {
  return {
    ...env,
    CURSOR_HMAC_SECRET: HMAC_SECRET,
    CF_ACCESS_AUD: 'aud-test',
    CF_ACCESS_TEAM: 'team-test.cloudflareaccess.com',
    BYPASS_CF_ACCESS: undefined,
    ...overrides,
  } as unknown as CloudflareBindings;
}

async function clearSuperadminTables() {
  await env.APP_DB.prepare('DELETE FROM account_key_services').run();
  await env.APP_DB.prepare('DELETE FROM api_keys').run();
  await env.APP_DB.prepare('DELETE FROM service_cors').run();
  await env.APP_DB.prepare(`DELETE FROM services WHERE id LIKE 'sa-%'`).run();
}

async function seedService(id: string, name: string, createdAt?: number) {
  const now = createdAt ?? Math.floor(Date.now() / 1000);
  await env.APP_DB.prepare(
    `INSERT INTO services (id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes, max_file_size_bytes, recommended_upload_destination, object_key_prefix, created_at)
     VALUES (?, ?, 'primary', 1000000, 0, 0, 100000, 'r2', '', ?)`
  )
    .bind(id, name, now)
    .run();
}

describe('superadmin V2 foundation', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    await clearSuperadminTables();
  }, TEST_TIMEOUT);

  it('returns V2 unauthorized error and X-Request-Id when CF Access token is missing', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/superadmin/services'), testEnv());

    expect(res.status).toBe(401);
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    const body = await res.json<{ error: { code: string; message: string; request_id: string } }>();
    expect(body.error.code).toBe('unauthorized');
    expect(body.error.request_id).toBeTruthy();
  }, TEST_TIMEOUT);

  it('echoes a valid incoming X-Request-Id on dev-bypassed success response', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services', {
        headers: { 'X-Request-Id': 'trace-superadmin-123' },
      }),
      testEnv({ BYPASS_CF_ACCESS: 'true' })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('trace-superadmin-123');
  }, TEST_TIMEOUT);
});

describe('superadmin services CRUD', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    await clearSuperadminTables();
  }, TEST_TIMEOUT);

  const devEnv = testEnv({ BYPASS_CF_ACCESS: 'true' });

  it('GET /services returns V2 list envelope with cursor pagination', async () => {
    await seedService('sa-svc-a', 'Service A', 1700000001);
    await seedService('sa-svc-b', 'Service B', 1700000002);
    await seedService('sa-svc-c', 'Service C', 1700000003);

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services?limit=2'),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; page: { limit: number; next_cursor: string | null } }>();
    expect(body.items).toHaveLength(2);
    expect(body.page.limit).toBe(2);
    expect(body.page.next_cursor).toBeTruthy();
  }, TEST_TIMEOUT);

  it('GET /services with forged cursor returns 400 cursor_invalid', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services?cursor=forged.invalidsig'),
      devEnv
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('cursor_invalid');
  }, TEST_TIMEOUT);

  it('POST /services returns 201 with V2 item envelope', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'sa-create-test',
          name: 'Created Service',
          default_bucket: 'primary',
          max_storage_bytes: 1000000,
          max_file_size_bytes: 100000,
        }),
      }),
      devEnv
    );

    expect(res.status).toBe(201);
    const body = await res.json<{ item: { id: string; name: string } }>();
    expect(body.item.id).toBe('sa-create-test');
    expect(body.item.name).toBe('Created Service');
  }, TEST_TIMEOUT);

  it('POST /services duplicate returns 409 conflict', async () => {
    await seedService('sa-dup-test', 'Dup Service');

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'sa-dup-test',
          name: 'Dup Service',
          default_bucket: 'primary',
          max_storage_bytes: 1000000,
          max_file_size_bytes: 100000,
        }),
      }),
      devEnv
    );

    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('conflict');
  }, TEST_TIMEOUT);

  it('GET /services/:id returns V2 item envelope', async () => {
    await seedService('sa-get-test', 'Get Service');

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-get-test'),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { id: string; name: string } }>();
    expect(body.item.id).toBe('sa-get-test');
    expect(body.item.name).toBe('Get Service');
  }, TEST_TIMEOUT);

  it('GET /services/:id returns 404 not_found for missing service', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-missing'),
      devEnv
    );

    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  }, TEST_TIMEOUT);

  it('PATCH /services/:id returns V2 item envelope', async () => {
    await seedService('sa-patch-test', 'Patch Service');

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-patch-test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Patched Name' }),
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { name: string } }>();
    expect(body.item.name).toBe('Patched Name');
  }, TEST_TIMEOUT);

  it('PATCH /services/:id with invalid body returns 400 validation_error', async () => {
    await seedService('sa-val-test', 'Validation Test');

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-val-test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
      devEnv
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string; details: unknown } }>();
    expect(body.error.code).toBe('validation_error');
  }, TEST_TIMEOUT);

  it('DELETE /services/:id returns V2 item envelope with deleted marker', async () => {
    await seedService('sa-del-test', 'Delete Service');

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-del-test', {
        method: 'DELETE',
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { id: string; deleted: boolean } }>();
    expect(body.item.id).toBe('sa-del-test');
    expect(body.item.deleted).toBe(true);
  }, TEST_TIMEOUT);
});

describe('superadmin API keys', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    await clearSuperadminTables();
    await seedService('sa-key-svc', 'Key Service');
  }, TEST_TIMEOUT);

  const devEnv = testEnv({ BYPASS_CF_ACCESS: 'true' });

  it('GET /services/:id/api-keys returns V2 list envelope with pagination', async () => {
    await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'key-one', ['admin']);
    await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'key-two', ['admin']);
    await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'key-three', ['admin']);

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-key-svc/api-keys?limit=2'),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; page: { limit: number; next_cursor: string | null } }>();
    expect(body.items).toHaveLength(2);
    expect(body.page.limit).toBe(2);
    expect(body.page.next_cursor).toBeTruthy();
  }, TEST_TIMEOUT);

  it('POST /services/:id/api-keys returns 201 with V2 item envelope', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-key-svc/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Key',
          permissions: ['admin'],
        }),
      }),
      devEnv
    );

    expect(res.status).toBe(201);
    const body = await res.json<{ item: { name: string; plaintext_key: string } }>();
    expect(body.item.name).toBe('New Key');
    expect(body.item.plaintext_key).toBeTruthy();
  }, TEST_TIMEOUT);

  it('POST /services/:id/api-keys returns 404 for missing service', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/services/sa-missing/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Key',
          permissions: ['admin'],
        }),
      }),
      devEnv
    );

    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  }, TEST_TIMEOUT);

  it('PATCH /services/:id/api-keys/:keyId returns V2 item envelope', async () => {
    const created = await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'patch-key', ['admin']);

    const app = buildApp();
    const res = await app.fetch(
      new Request(`http://localhost/superadmin/services/sa-key-svc/api-keys/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'renamed-key' }),
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { name: string } }>();
    expect(body.item.name).toBe('renamed-key');
  }, TEST_TIMEOUT);

  it('DELETE /services/:id/api-keys/:keyId returns V2 item envelope', async () => {
    const created = await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'del-key', ['admin']);

    const app = buildApp();
    const res = await app.fetch(
      new Request(`http://localhost/superadmin/services/sa-key-svc/api-keys/${created.id}`, {
        method: 'DELETE',
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { id: string; revoked: boolean } }>();
    expect(body.item.id).toBe(created.id);
    expect(body.item.revoked).toBe(true);
  }, TEST_TIMEOUT);

  it('POST /services/:id/api-keys/:keyId/rotate returns V2 item envelope', async () => {
    const created = await createServiceApiKey(env.APP_DB, 'sa-key-svc', 'rotate-key', ['admin']);

    const app = buildApp();
    const res = await app.fetch(
      new Request(`http://localhost/superadmin/services/sa-key-svc/api-keys/${created.id}/rotate`, {
        method: 'POST',
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { name: string; plaintext_key: string } }>();
    expect(body.item.name).toBe('rotate-key');
    expect(body.item.plaintext_key).toBeTruthy();
  }, TEST_TIMEOUT);

  it('GET /account-keys returns V2 list envelope with service_ids', async () => {
    await createAccountApiKey(env.APP_DB, 'acct-key', ['admin'], ['sa-key-svc']);

    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/account-keys?limit=10'),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ items: Array<{ service_ids: string[] }>; page: { limit: number } }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].service_ids).toContain('sa-key-svc');
  }, TEST_TIMEOUT);

  it('POST /account-keys returns 201 with V2 item envelope', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/account-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Acct Key',
          permissions: ['admin'],
          service_ids: ['sa-key-svc'],
        }),
      }),
      devEnv
    );

    expect(res.status).toBe(201);
    const body = await res.json<{ item: { name: string; plaintext_key: string } }>();
    expect(body.item.name).toBe('Acct Key');
    expect(body.item.plaintext_key).toBeTruthy();
  }, TEST_TIMEOUT);

  it('PATCH /account-keys/:keyId returns V2 item envelope', async () => {
    const created = await createAccountApiKey(env.APP_DB, 'acct-patch', ['admin'], ['sa-key-svc']);

    const app = buildApp();
    const res = await app.fetch(
      new Request(`http://localhost/superadmin/account-keys/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'renamed-acct' }),
      }),
      devEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json<{ item: { name: string } }>();
    expect(body.item.name).toBe('renamed-acct');
  }, TEST_TIMEOUT);

  it('DELETE /account-keys/:keyId returns 404 for non-existent key', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/superadmin/account-keys/nonexistent', {
        method: 'DELETE',
      }),
      devEnv
    );

    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('not_found');
  }, TEST_TIMEOUT);
});
