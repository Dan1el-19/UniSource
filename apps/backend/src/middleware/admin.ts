import { createMiddleware } from 'hono/factory';
import { hasApiKeyPermission } from './apiKeyPermissions';
import { V2Error } from '../lib/v2/errors';
import { isAlwaysV2Path } from '../lib/v2/negotiation';

export const requireAdminMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  if (c.get('authType') === 'apikey') {
    if (!isAlwaysV2Path(c.req.path) || hasApiKeyPermission(c, 'admin')) {
      return next();
    }
    throw new V2Error('forbidden', 403, 'Admin access required');
  }

  if (c.get('isAdmin')) {
    return next();
  }

  if (isAlwaysV2Path(c.req.path)) {
    throw new V2Error('forbidden', 403, 'Admin access required');
  }
  return c.json({ error: 'Forbidden', message: 'Admin access required' }, 403);
});
