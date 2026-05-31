import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2Error, errorResponse } from '../src/lib/v2/errors';

vi.mock('../src/db/v1/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/v1/services')>();
  return { ...actual, getServiceUser: vi.fn() };
});

import { requireRoleMiddleware } from '../src/middleware/requireRole';
import { getServiceUser } from '../src/db/v1/services';

function buildRoleApp(allowedRoles: string[], userId: string, authType: 'appwrite' | 'apikey', isAdmin = false) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', 'default' as WorkerVariables['serviceId']);
    c.set('authType', authType as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    await next();
  });
  app.use('*', requireRoleMiddleware(allowedRoles));
  app.get('/protected', (c) => c.json({ ok: true }));
  app.get('/v2/protected', (c) => c.json({ ok: true }));
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err);
    throw err;
  });
  return app;
}

const mockDb = { prepare: vi.fn() } as unknown as D1Database;
const env = { APP_DB: mockDb } as unknown as CloudflareBindings;

describe('requireRoleMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('allows API keys with admin permission', async () => {
    const app = buildRoleApp(['plus', 'admin'], 'system', 'apikey', true);
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
  });

  it('allows legacy API-key callers without the newer V2 permission check', async () => {
    const app = buildRoleApp(['plus', 'admin'], 'system', 'apikey');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
  });

  it('blocks V2 API keys without admin permission', async () => {
    const app = buildRoleApp(['plus', 'admin'], 'system', 'apikey');
    const res = await app.fetch(new Request('http://localhost/v2/protected'), env);
    expect(res.status).toBe(403);
  });

  it('blocks user with insufficient role', async () => {
    vi.mocked(getServiceUser).mockResolvedValue({ service_id: 'default', user_id: 'u1', role: 'user', max_storage_bytes: null, current_used_bytes: 0, created_at: 0 } as any);
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(403);
  });

  it('allows user with matching role', async () => {
    vi.mocked(getServiceUser).mockResolvedValue({ service_id: 'default', user_id: 'u1', role: 'plus', max_storage_bytes: null, current_used_bytes: 0, created_at: 0 } as any);
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
  });

  it('returns 403 when user has no service_users record', async () => {
    vi.mocked(getServiceUser).mockResolvedValue(null);
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(403);
  });
});
