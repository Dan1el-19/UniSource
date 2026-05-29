import type { Context } from 'hono';

export const V2_VERSION_HEADER = 'X-Unisource-API-Version';

export function isAlwaysV2Path(pathname: string): boolean {
  return pathname.startsWith('/v2') || pathname.startsWith('/superadmin');
}

export function wantsV2(c: Context): boolean {
  const pathname = new URL(c.req.url).pathname;
  if (isAlwaysV2Path(pathname)) return true;

  const explicit = c.req.header(V2_VERSION_HEADER)?.trim();
  if (explicit === '2') return true;

  const accept = c.req.header('Accept') ?? '';
  return accept.split(',').some((part) => part.trim().toLowerCase() === 'application/vnd.unisource.v2+json');
}
