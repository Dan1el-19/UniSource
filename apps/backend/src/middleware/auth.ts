import type { MiddlewareHandler } from 'hono';
import { Client, Account } from 'node-appwrite';


export const authMiddleware: MiddlewareHandler<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}> = async (c, next) => {
  // Path A: Appwrite JWT (Svelte island / Expo client)
  const jwt = c.req.header('X-Appwrite-JWT');

  if (jwt) {
    try {
      const client = new Client()
        .setEndpoint(c.env.APPWRITE_ENDPOINT)
        .setProject(c.env.APPWRITE_PROJECT_ID)
        .setJWT(jwt);

      const account = new Account(client);
      const user = await account.get();

      c.set('userId', user.$id);
      c.set('authType', 'appwrite');
      return next();
    } catch {
      // JWT invalid — fall through to path B
    }
  }

  // Path B: static API key (Astro SSR / server-to-server / cron)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token === c.env.USRC_API_KEY) {
      c.set('userId', 'system');
      c.set('authType', 'apikey');
      return next();
    }
  }

  return c.json({ error: 'Unauthorized', message: 'Missing or invalid credentials' }, 401);
};
