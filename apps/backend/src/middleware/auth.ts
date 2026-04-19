import { createMiddleware } from 'hono/factory';
import { Client, Account } from 'node-appwrite';
import { checkUserServiceAccess } from '../db/services';
import { isKnownServiceId, getServiceConfig, DEFAULT_SERVICE_ID } from '../config/services';

export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  // Derive service from header — treat as hint, ALWAYS verify access below
  const rawServiceId = c.req.header('X-Service-ID')?.trim().toLowerCase();

  if (rawServiceId && !isKnownServiceId(rawServiceId)) {
    return c.json({ error: 'Bad Request', message: `Unknown service: ${rawServiceId}` }, 400);
  }

  const serviceId = rawServiceId ?? DEFAULT_SERVICE_ID;

  // Path A: Appwrite JWT (Svelte island / Expo mobile client)
  const jwt = c.req.header('X-Appwrite-JWT');
  if (jwt) {
    try {
      const client = new Client()
        .setEndpoint(c.env.APPWRITE_ENDPOINT)
        .setProject(c.env.APPWRITE_PROJECT_ID)
        .setJWT(jwt);

      const account = new Account(client);
      const user = await account.get();

      // Non-default services require explicit service_users membership
      // This prevents a usrc.dev account from accessing blokserwis data
      if (serviceId !== DEFAULT_SERVICE_ID) {
        const access = await checkUserServiceAccess(c.env.usrc_d1, serviceId, user.$id);
        if (!access) {
          return c.json({ error: 'Forbidden', message: 'Access to this service is not permitted' }, 403);
        }
      }

      c.set('userId', user.$id);
      c.set('serviceId', serviceId);
      c.set('authType', 'appwrite');
      return next();
    } catch {
      // JWT invalid or expired — fall through to next path
    }
  }

  // Path B: Service-scoped static API key (Astro SSR / server-to-server / cron)
  // Each service has its own secret: USRC_API_KEY, BLOKSERWIS_API_KEY, etc.
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const config = getServiceConfig(serviceId)!;
    const expectedKey = (c.env as unknown as Record<string, string | undefined>)[config.apiKeyEnvVar];

    if (token && expectedKey && token === expectedKey) {
      c.set('userId', 'system');
      c.set('serviceId', serviceId);
      c.set('authType', 'apikey');
      return next();
    }
  }

  return c.json({ error: 'Unauthorized', message: 'Missing or invalid credentials' }, 401);
});
