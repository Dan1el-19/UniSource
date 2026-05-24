import { createMiddleware } from 'hono/factory';
import { getServiceUser } from '../db/services';

export function requireRoleMiddleware(allowedRoles: string[]) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>(
    async (c, next) => {
      if (c.get('authType') === 'apikey') return next();

      const userId = c.get('userId');
      const serviceId = c.get('serviceId');
      const user = await getServiceUser(c.env.APP_DB, serviceId, userId);

      if (!user || !allowedRoles.includes(user.role)) {
        return c.json({ error: 'Forbidden', message: 'Insufficient role' }, 403);
      }

      return next();
    }
  );
}
