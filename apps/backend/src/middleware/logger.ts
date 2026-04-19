import type { Context, Next } from 'hono';

export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  // Do not log health checks unless they fail
  if (c.req.path === '/health' && c.res.status === 200) return;

  const logData = {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms,
    ip: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown',
    serviceId: c.get('serviceId') ?? 'unknown',
    userId: c.get('userId') ?? 'unknown',
    authType: c.get('authType') ?? 'none',
  };

  if (c.res.status >= 500) {
    console.error(JSON.stringify({ level: 'error', ...logData }));
  } else if (c.res.status >= 400) {
    console.warn(JSON.stringify({ level: 'warn', ...logData }));
  } else {
    console.info(JSON.stringify({ level: 'info', ...logData }));
  }
}

export function logError(message: string, error: unknown, c?: Context) {
  const logData: any = { level: 'error', message };
  
  if (error instanceof Error) {
    logData.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else {
    logData.error = String(error);
  }

  if (c) {
    logData.context = {
      method: c.req.method,
      path: c.req.path,
      serviceId: c.get('serviceId') ?? 'unknown',
      userId: c.get('userId') ?? 'unknown',
    };
  }

  console.error(JSON.stringify(logData));
}
