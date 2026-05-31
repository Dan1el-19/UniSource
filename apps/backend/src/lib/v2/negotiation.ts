import type { Context } from 'hono';

export function isAlwaysV2Path(pathname: string): boolean {
  return pathname === '/v2' || pathname.startsWith('/v2/');
}

export function wantsV2(c: Context): boolean {
  const pathname = new URL(c.req.url).pathname;
  return isAlwaysV2Path(pathname);
}
