import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import {
  createAccountApiKey,
  createServiceApiKey,
  listAccountApiKeysPage,
  listServiceApiKeysPage,
} from '../src/db/apiKeys';

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

const TEST_TIMEOUT = 15000;
const HMAC_SECRET = 'test-secret-32-bytes-long-padding!!';

async function resetTables() {
  await env.APP_DB.prepare('DELETE FROM account_key_services').run();
  await env.APP_DB.prepare('DELETE FROM api_keys').run();
  await env.APP_DB.prepare(`DELETE FROM services WHERE id LIKE 'sa-page-%'`).run();
  await env.APP_DB.prepare(
    `INSERT INTO services (id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes, max_file_size_bytes, recommended_upload_destination, object_key_prefix, created_at)
     VALUES ('sa-page-a', 'SA Page A', 'primary', 1000000, 0, 0, 100000, 'r2', '', 1700000001),
            ('sa-page-b', 'SA Page B', 'primary', 1000000, 0, 0, 100000, 'r2', '', 1700000002)
     ON CONFLICT(id) DO NOTHING`
  ).run();
}

describe('API key pagination helpers', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS);
  }, TEST_TIMEOUT);

  beforeEach(async () => {
    await resetTables();
  }, TEST_TIMEOUT);

  it('paginates service-level API keys by created_at desc', async () => {
    await createServiceApiKey(env.APP_DB, 'sa-page-a', 'one', ['admin']);
    await createServiceApiKey(env.APP_DB, 'sa-page-a', 'two', ['admin']);
    await createServiceApiKey(env.APP_DB, 'sa-page-a', 'three', ['admin']);

    const first = await listServiceApiKeysPage(env.APP_DB, 'sa-page-a', {
      limit: 2,
      cursor: undefined,
      cursorSecret: HMAC_SECRET,
    });

    expect(first.items).toHaveLength(2);
    expect(first.page.limit).toBe(2);
    expect(first.page.next_cursor).toBeTruthy();

    const second = await listServiceApiKeysPage(env.APP_DB, 'sa-page-a', {
      limit: 2,
      cursor: first.page.next_cursor!,
      cursorSecret: HMAC_SECRET,
    });

    expect(second.items).toHaveLength(1);
    expect(second.page.next_cursor).toBeNull();
  }, TEST_TIMEOUT);

  it('paginates account-level API keys with service_ids attached', async () => {
    await createAccountApiKey(env.APP_DB, 'one', ['admin'], ['sa-page-a']);
    await createAccountApiKey(env.APP_DB, 'two', ['admin'], ['sa-page-a', 'sa-page-b']);
    await createAccountApiKey(env.APP_DB, 'three', ['admin'], ['sa-page-b']);

    const first = await listAccountApiKeysPage(env.APP_DB, {
      limit: 2,
      cursor: undefined,
      cursorSecret: HMAC_SECRET,
    });

    expect(first.items).toHaveLength(2);
    expect(first.items[0].service_ids.length).toBeGreaterThan(0);
    expect(first.page.next_cursor).toBeTruthy();

    const second = await listAccountApiKeysPage(env.APP_DB, {
      limit: 2,
      cursor: first.page.next_cursor!,
      cursorSecret: HMAC_SECRET,
    });

    expect(second.items).toHaveLength(1);
    expect(second.page.next_cursor).toBeNull();
  }, TEST_TIMEOUT);
});
