import { createMiddleware } from 'hono/factory';

export const adminPreviewMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  const targetUserId = c.req.header('X-Target-User-ID');

  if (!targetUserId) return next();

  if (!c.get('isAdmin')) {
    return c.json({ error: 'Forbidden', message: 'Admin access required to use X-Target-User-ID' }, 403);
  }

  c.set('actorId', c.get('userId'));
  c.set('userId', targetUserId);

  return next();
});
