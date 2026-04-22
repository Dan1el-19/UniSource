import { createMiddleware } from 'hono/factory';

export const requireAdminMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  if (c.get('authType') === 'apikey' || c.get('isAdmin')) {
    return next();
  }

  return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
});
