import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return { ...actual, getServiceUser: vi.fn() };
});

import { requireRoleMiddleware } from '../src/middleware/requireRole';
import { getServiceUser } from '../src/db/services';

function buildRoleApp(allowedRoles: string[], userId: string, authType: 'appwrite' | 'apikey') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', 'default' as WorkerVariables['serviceId']);
    c.set('authType', authType as WorkerVariables['authType']);
    c.set('isAdmin', false as WorkerVariables['isAdmin']);
    await next();
  });
  app.use('*', requireRoleMiddleware(allowedRoles));
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

const mockDb = { prepare: vi.fn() } as unknown as D1Database;
const env = { APP_DB: mockDb } as unknown as CloudflareBindings;

describe('requireRoleMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('allows API key callers regardless of role', async () => {
    const app = buildRoleApp(['plus', 'admin'], 'system', 'apikey');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
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
