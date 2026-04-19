import type { MiddlewareHandler } from 'hono';


export const authMiddleware: MiddlewareHandler<{ Bindings: CloudflareBindings }> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  const apiKey = c.env.USRC_API_KEY;

  if (!apiKey || token !== apiKey) {
    return c.json({ error: 'Forbidden', message: 'Invalid API key' }, 403);
  }

  await next();
};
