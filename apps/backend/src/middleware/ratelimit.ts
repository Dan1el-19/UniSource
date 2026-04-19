import { createMiddleware } from 'hono/factory';

export const rateLimitMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  // If the environment does not have the rate limiter configured, bypass it.
  if (!c.env.RATE_LIMITER) {
    return next();
  }

  // Rate limit by IP address or fallback to serviceId context
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? c.get('serviceId') ?? 'anonymous';
  
  // Rate limit primarily anonymous / API key driven paths more strictly.
  // We apply the rate limit binding key.
  const { success } = await c.env.RATE_LIMITER.limit({ key: ip });

  if (!success) {
    return c.json({ error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' }, 429);
  }

  return next();
});
