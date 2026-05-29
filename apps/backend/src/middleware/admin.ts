import { createMiddleware } from 'hono/factory';
import { hasApiKeyPermission } from './apiKeyPermissions';
import { V2Error } from '../lib/v2/errors';

export const requireAdminMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  if (c.get('authType') === 'apikey') {
    if (hasApiKeyPermission(c, 'admin')) {
      return next();
    }
    throw new V2Error('forbidden', 403, 'Admin access required');
  }

  if (c.get('isAdmin')) {
    return next();
  }

  throw new V2Error('forbidden', 403, 'Admin access required');
});
