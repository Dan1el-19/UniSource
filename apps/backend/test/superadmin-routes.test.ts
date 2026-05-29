import { Hono } from 'hono';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import superadmin from '../src/routes/superadmin';
import { V2Error, errorResponse } from '../src/lib/v2/errors';

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
