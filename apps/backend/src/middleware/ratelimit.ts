import { createMiddleware } from 'hono/factory';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * Rate-limit policy. Each policy maps to a separate Cloudflare Rate Limiting
 * binding (defined in `wrangler.jsonc`) so that different traffic classes get
 * their own limit/period instead of sharing a single global counter.
 *
 *  - general:        applied globally after auth (catches any authed traffic)
 *  - upload-init:    expensive endpoints that allocate quota / presigned URLs
 *  - public-read:    unauthenticated public share-link metadata + downloads
 *  - auth-fail:      bumped on failed auth attempts to mitigate brute-force
 *  - share-password: bumped on share-link password attempts (per slug + ip)
 *
 * Cloudflare Rate Limiting only supports `period` of 10 or 60 seconds; for
 * tighter long-window limits we'd need a Durable Object — kept out of scope.
 */
export type RateLimitPolicy =
  | 'general'
  | 'upload-init'
  | 'public-read'
  | 'auth-fail'
  | 'share-password';

type RateLimiterBinding = { limit: (config: { key: string }) => Promise<{ success: boolean }> };

const POLICY_BINDING: Record<RateLimitPolicy, keyof CloudflareBindings> = {
  general: 'RL_GENERAL',
  'upload-init': 'RL_UPLOAD_INIT',
  'public-read': 'RL_PUBLIC_READ',
  'auth-fail': 'RL_AUTH_FAIL',
  'share-password': 'RL_SHARE_PASSWORD',
};

const TEXT_ENCODER = new TextEncoder();

/**
 * Cloudflare Rate Limiting requires keys ≤ 64 chars. We hash everything we
 * mix in (IPv6 + UUID + slug + path can easily exceed that) so the key always
 * fits regardless of input length, while keeping the policy + auth-class
 * prefix human-readable in logs.
 */
async function hashKeyMaterial(material: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(material));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 16; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ??
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
    'no-ip'
  );
}

/**
 * Build the rate-limit key for a request. Policy-specific so that we never
 * share a counter between traffic classes (e.g. authed user GET vs anonymous
 * brute-force on the same IP).
 *
 * Pre-auth policies (`auth-fail`, `public-read`, `share-password`) key by IP
 * (+ optional discriminator) since `userId` isn't available yet.
 *
 * Post-auth policies (`general`, `upload-init`) key by `userId` when a real
 * user is authenticated, otherwise by `serviceId:ip` so API-key callers get
 * isolated buckets per service even though they all share `userId='system'`.
 */
async function buildKey(
  policy: RateLimitPolicy,
  c: Context,
  discriminator: string | undefined
): Promise<string> {
  const ip = getClientIp(c);

  if (policy === 'auth-fail' || policy === 'public-read') {
    const material = `${policy}|ip|${ip}|${discriminator ?? ''}`;
    return `${policy}:${await hashKeyMaterial(material)}`;
  }

  if (policy === 'share-password') {
    // Bind both ip AND slug — prevents "spread the brute force across slugs"
    // from one IP and also prevents "spread across IPs" against one slug.
    const material = `${policy}|ip|${ip}|slug|${discriminator ?? ''}`;
    return `${policy}:${await hashKeyMaterial(material)}`;
  }

  // Authenticated policies (general, upload-init).
  const userId = (c.get('userId') as string | undefined) ?? null;
  const serviceId = (c.get('serviceId') as string | undefined) ?? null;

  let identityMaterial: string;
  if (userId && userId !== 'system') {
    identityMaterial = `user|${userId}`;
  } else if (userId === 'system' && serviceId) {
    // API-key caller: isolate per service AND per IP so a leaked key on one
    // host can't drain the whole service's quota.
    identityMaterial = `system|${serviceId}|${ip}`;
  } else {
    identityMaterial = `anon|${serviceId ?? '-'}|${ip}`;
  }

  const material = `${policy}|${identityMaterial}|${discriminator ?? ''}`;
  return `${policy}:${await hashKeyMaterial(material)}`;
}

/**
 * Resolve the Rate Limiter binding for a policy. Returns null when the
 * binding is missing — this is the legitimate "local dev / test" mode and
 * the middleware will pass through without limiting.
 */
function getBinding(c: Context, policy: RateLimitPolicy): RateLimiterBinding | null {
  const bindingName = POLICY_BINDING[policy];
  const binding = (c.env as Record<string, unknown>)[bindingName];
  if (!binding || typeof (binding as RateLimiterBinding).limit !== 'function') {
    return null;
  }
  return binding as RateLimiterBinding;
}

export interface RateLimitOptions {
  /**
   * Optional extra key material — e.g. share-link slug for `share-password`.
   * When omitted, only the policy + identity contribute to the key.
   */
  discriminator?: (c: Context) => string | undefined;
}

/**
 * Programmatic check — used from inside other middleware (e.g. authMiddleware
 * bumps `auth-fail` before returning 401). Returns `{ allowed: false }` when
 * the limit is exceeded; callers decide how to respond.
 */
export async function consumeRateLimit(
  c: Context,
  policy: RateLimitPolicy,
  discriminator?: string
): Promise<{ allowed: boolean }> {
  const binding = getBinding(c, policy);
  if (!binding) return { allowed: true };
  const key = await buildKey(policy, c, discriminator);
  const { success } = await binding.limit({ key });
  return { allowed: success };
}

/**
 * Hono middleware factory — bind once per route (or globally) with the
 * desired policy. Bypasses cleanly when the binding is missing so unit tests
 * and `wrangler dev` without a configured limiter keep working.
 */
export function rateLimit(policy: RateLimitPolicy, options: RateLimitOptions = {}): MiddlewareHandler<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}> {
  return createMiddleware<{
    Bindings: CloudflareBindings;
    Variables: WorkerVariables;
  }>(async (c, next) => {
    const binding = getBinding(c, policy);
    if (!binding) return next();

    const discriminator = options.discriminator?.(c);
    const key = await buildKey(policy, c, discriminator);
    const { success } = await binding.limit({ key });

    if (!success) {
      return c.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded. Please try again later.' },
        429
      );
    }
    return next();
  });
}

/**
 * Backwards-compatibility alias. Older route files still import
 * `rateLimitMiddleware`; it now resolves to the `upload-init` policy which
 * matches its prior usage (it was only mounted on /upload/* and /public/*
 * unlock endpoints). New code should call `rateLimit(policy)` directly.
 *
 * @deprecated use `rateLimit('upload-init')` etc.
 */
export const rateLimitMiddleware = rateLimit('upload-init');
