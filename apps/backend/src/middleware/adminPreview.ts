import { createMiddleware } from 'hono/factory';
import { V2Error } from '../lib/v2/errors';

export const adminPreviewMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  const targetUserId = c.req.header('X-Target-User-ID');

  if (!targetUserId) return next();

  const isAdmin = c.get('authType') === 'apikey'
    ? c.get('isAdmin')
    : c.get('isAdmin');

  if (!isAdmin) {
    const isApiKeyRead = c.get('authType') === 'apikey' && c.get('apiKeyPermissions')?.includes('files:read')
    if (!isApiKeyRead) {
      throw new V2Error('forbidden', 403, 'Admin access required to use X-Target-User-ID')
    }
  }

  c.set('actorId', c.get('userId'));
  c.set('userId', targetUserId);

  return next();
});
