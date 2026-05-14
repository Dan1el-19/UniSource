import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

interface JwksKey {
  kid: string;
  kty: string;
  use: string;
  n: string;
  e: string;
  alg: string;
}

let jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(teamDomain: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JwksKey[] };
  jwksCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const b64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string
): Promise<{ email: string; sub: string } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as Record<string, string>;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as Record<string, unknown>;
    const signature = base64UrlDecode(parts[2]);

    const audClaim = payload['aud'];
    const audList = Array.isArray(audClaim) ? audClaim : [audClaim];
    if (!audList.includes(aud)) return null;

    const exp = payload['exp'] as number | undefined;
    if (exp !== undefined && exp < Math.floor(Date.now() / 1000)) return null;

    const keys = await fetchJwks(teamDomain);
    const kid = header['kid'];
    const key = kid ? keys.find((k) => k.kid === kid) : keys[0];
    if (!key) return null;

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: key.kty, n: key.n, e: key.e, alg: key.alg, use: key.use },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature.buffer as ArrayBuffer, signingInput.buffer as ArrayBuffer);
    if (!valid) return null;

    const email = payload['email'] as string | undefined;
    const sub = payload['sub'] as string | undefined;
    if (!email || !sub) return null;

    return { email, sub };
  } catch {
    return null;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  // Dev bypass
  if (env.BYPASS_CF_ACCESS === 'true') {
    event.locals.user = { email: 'dev@localhost', sub: 'dev' };
    return resolve(event);
  }

  const aud = env.CF_ACCESS_AUD;
  const team = env.CF_ACCESS_TEAM;

  if (!aud || !team) {
    event.locals.user = null;
    return resolve(event);
  }

  const jwtFromHeader = event.request.headers.get('Cf-Access-Jwt-Assertion');
  const cookieHeader = event.request.headers.get('Cookie') ?? '';
  const jwtFromCookie =
    cookieHeader
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('CF_Authorization='))
      ?.slice('CF_Authorization='.length) ?? null;

  const token = jwtFromHeader ?? jwtFromCookie;

  if (!token) {
    event.locals.user = null;
    return resolve(event);
  }

  event.locals.user = await verifyAccessJwt(token, team, aud);
  return resolve(event);
};
