import { createMiddleware } from 'hono/factory';
import { V2Error } from '../lib/v2/errors';
import { isAlwaysV2Path } from '../lib/v2/negotiation';

export const adminPreviewMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  const targetUserId = c.req.header('X-Target-User-ID');

  if (!targetUserId) return next();

  const isAdmin = c.get('isAdmin');

  if (!isAdmin) {
    const isV2Path = isAlwaysV2Path(c.req.path);
    const isApiKeyRead = isV2Path
      && c.get('authType') === 'apikey'
      && c.get('apiKeyPermissions')?.includes('files:read');
    if (!isApiKeyRead) {
      if (isV2Path) {
        throw new V2Error('forbidden', 403, 'Admin access required to use X-Target-User-ID');
      }
      return c.json({ error: 'Forbidden', message: 'Admin access required to use X-Target-User-ID' }, 403);
    }
  }

  c.set('actorId', c.get('userId'));
  c.set('userId', targetUserId);

  return next();
});
