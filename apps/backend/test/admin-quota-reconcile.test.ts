import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return {
    ...actual,
    reconcileQuota: vi.fn(),
    logServiceEvent: vi.fn(),
  };
});

import { reconcileQuota } from '../src/db/services';
import admin from '../src/routes/admin';

function buildAdminApp(db: D1Database) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'admin-user' as WorkerVariables['userId']);
    c.set('serviceId', 'default' as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/admin', admin);
  return { app, env: { APP_DB: db } as unknown as CloudflareBindings };
}

function mockD1(): D1Database {
  return {
    prepare: () => ({ bind: () => ({ run: () => Promise.resolve({ meta: { changes: 0 }, results: [] }) }) }),
  } as unknown as D1Database;
}

describe('POST /admin/quota/reconcile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with reconcile report', async () => {
    vi.mocked(reconcileQuota).mockResolvedValue({
      service_drift_bytes: 0,
      service_corrected: false,
      users_fixed: 0,
      dry_run: false,
    });

    const { app, env } = buildAdminApp(mockD1());

    const res = await app.fetch(
      new Request('http://localhost/admin/quota/reconcile', { method: 'POST' }),
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { service_drift_bytes: number; dry_run: boolean };
    expect(typeof body.service_drift_bytes).toBe('number');
    expect(body.dry_run).toBe(false);
  });

  it('returns dry_run: true when ?dry_run=true', async () => {
    vi.mocked(reconcileQuota).mockResolvedValue({
      service_drift_bytes: 500,
      service_corrected: false,
      users_fixed: 0,
      dry_run: true,
    });

    const { app, env } = buildAdminApp(mockD1());

    const res = await app.fetch(
      new Request('http://localhost/admin/quota/reconcile?dry_run=true', { method: 'POST' }),
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { dry_run: boolean; service_drift_bytes: number };
    expect(body.dry_run).toBe(true);
    expect(body.service_drift_bytes).toBe(500);
  });
});
