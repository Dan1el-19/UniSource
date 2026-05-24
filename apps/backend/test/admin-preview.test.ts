import { Hono } from 'hono';
import { describe, it, expect } from 'vitest';
import { adminPreviewMiddleware } from '../src/middleware/adminPreview';

function buildPreviewApp(isAdmin: boolean) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'admin-1' as WorkerVariables['userId']);
    c.set('serviceId', 'default' as WorkerVariables['serviceId']);
    c.set('authType', 'appwrite' as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    await next();
  });
  app.use('*', adminPreviewMiddleware);
  app.get('/test', (c) => c.json({ userId: c.get('userId'), actorId: c.get('actorId') }));
  return app;
}

const env = { APP_DB: {} } as unknown as CloudflareBindings;

describe('adminPreviewMiddleware', () => {
  it('substitutes userId when admin provides X-Target-User-ID', async () => {
    const app = buildPreviewApp(true);
    const res = await app.fetch(
      new Request('http://localhost/test', { headers: { 'X-Target-User-ID': 'target-user' } }),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; actorId: string };
    expect(body.userId).toBe('target-user');
    expect(body.actorId).toBe('admin-1');
  });

  it('returns 403 when non-admin provides X-Target-User-ID', async () => {
    const app = buildPreviewApp(false);
    const res = await app.fetch(
      new Request('http://localhost/test', { headers: { 'X-Target-User-ID': 'target-user' } }),
      env
    );
    expect(res.status).toBe(403);
  });

  it('passes through unchanged when no X-Target-User-ID header', async () => {
    const app = buildPreviewApp(false);
    const res = await app.fetch(new Request('http://localhost/test'), env);
    const body = await res.json() as { userId: string; actorId: string | undefined };
    expect(body.userId).toBe('admin-1');
    expect(body.actorId).toBeUndefined();
  });

  it('returns 403 when API key caller is not admin', async () => {
    const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
    app.use('*', async (c, next) => {
      c.set('userId', 'system' as WorkerVariables['userId']);
      c.set('serviceId', 'default' as WorkerVariables['serviceId']);
      c.set('authType', 'apikey' as WorkerVariables['authType']);
      c.set('isAdmin', false as WorkerVariables['isAdmin']);
      await next();
    });
    app.use('*', adminPreviewMiddleware);
    app.get('/test', (c) => c.json({ userId: c.get('userId') }));

    const res = await app.fetch(
      new Request('http://localhost/test', { headers: { 'X-Target-User-ID': 'target-user' } }),
      env
    );
    expect(res.status).toBe(403);
  });
});
