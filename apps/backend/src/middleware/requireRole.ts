import { createMiddleware } from 'hono/factory';
import { getServiceUser } from '../db/v1/services';
import { V2Error } from '../lib/v2/errors';

export function requireRoleMiddleware(allowedRoles: string[]) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>(
    async (c, next) => {
      if (c.get('authType') === 'apikey') {
        if (c.get('isAdmin')) return next();
        throw new V2Error('forbidden', 403, 'Insufficient API key permissions');
      }

      const userId = c.get('userId');
      const serviceId = c.get('serviceId');
      const user = await getServiceUser(c.env.APP_DB, serviceId, userId);

      if (!user || !allowedRoles.includes(user.role)) {
        throw new V2Error('forbidden', 403, 'Insufficient role');
      }

      return next();
    }
  );
}
