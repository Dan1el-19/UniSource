import { createMiddleware } from 'hono/factory';
import { getServiceUser } from '../db/v1/services';
import { V2Error } from '../lib/v2/errors';
import { isAlwaysV2Path } from '../lib/v2/negotiation';

export function requireRoleMiddleware(allowedRoles: string[]) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>(
    async (c, next) => {
      if (c.get('authType') === 'apikey') {
        if (!isAlwaysV2Path(c.req.path)) return next();
        if (c.get('isAdmin')) return next();
        throw new V2Error('forbidden', 403, 'Insufficient API key permissions');
      }

      const userId = c.get('userId');
      const serviceId = c.get('serviceId');
      const user = await getServiceUser(c.env.APP_DB, serviceId, userId);

      if (!user || !allowedRoles.includes(user.role)) {
        if (isAlwaysV2Path(c.req.path)) {
          throw new V2Error('forbidden', 403, 'Insufficient role');
        }
        return c.json({ error: 'Forbidden', message: 'Insufficient role' }, 403);
      }

      return next();
    }
  );
}
