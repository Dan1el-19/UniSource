import { createMiddleware } from "hono/factory";
import { timingSafeEqual } from "hono/utils/buffer";
import { V2Error } from "../lib/v2/errors";

export interface CfAccessUser {
  email: string;
  sub: string;
}

interface JwksKey {
  kid: string;
  kty: string;
  use: string;
  n: string;
  e: string;
  alg: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

// Simple in-memory JWKS cache (per isolate lifetime)
let jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchJwks(teamDomain: string): Promise<JwksKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Failed to fetch JWKS from ${url}: ${res.status}`);

  const data = (await res.json()) as JwksResponse;
  jwksCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importRsaPublicKey(jwk: JwksKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, use: jwk.use },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function parseJwtParts(token: string): {
  header: Record<string, string>;
  payload: Record<string, unknown>;
  signature: Uint8Array;
  signingInput: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const header = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[0])),
  ) as Record<string, string>;
  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1])),
  ) as Record<string, unknown>;
  const signature = base64UrlDecode(parts[2]);
  const signingInput = `${parts[0]}.${parts[1]}`;

  return { header, payload, signature, signingInput };
}

async function verifyJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<CfAccessUser | null> {
  try {
    const { header, payload, signature, signingInput } = parseJwtParts(token);

    // Verify aud
    const audClaim = payload["aud"];
    const audList = Array.isArray(audClaim) ? audClaim : [audClaim];
    if (!audList.includes(aud)) return null;

    // Verify exp
    const exp = payload["exp"] as number | undefined;
    if (exp !== undefined && exp < Math.floor(Date.now() / 1000)) return null;

    // Find matching key
    const keys = await fetchJwks(teamDomain);
    const kid = header["kid"];
    const matchingKey = kid ? keys.find((k) => k.kid === kid) : keys[0];
    if (!matchingKey) return null;

    const cryptoKey = await importRsaPublicKey(matchingKey);
    const signingInputBytes = new TextEncoder().encode(signingInput);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      signingInputBytes,
    );

    if (!valid) return null;

    const email = payload["email"] as string | undefined;
    const sub = payload["sub"] as string | undefined;
    const commonName = payload["common_name"] as string | undefined;

    // Service token JWT: empty sub, no email, common_name set to client_id
    if (commonName && (!email || !sub)) {
      return { email: `service:${commonName}`, sub: commonName };
    }

    if (!email || !sub) return null;

    return { email, sub };
  } catch {
    return null;
  }
}

export const cfAccessMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables & { cfAccessUser: CfAccessUser };
}>(async (c, next) => {
  const env = c.env as unknown as Record<string, string | undefined>;

  // Dev bypass — only when explicitly set
  if (env.BYPASS_CF_ACCESS === "true") {
    const devUser = { email: "dev@localhost", sub: "dev" };
    c.set("cfAccessUser" as never, devUser as never);
    c.set("userId" as never, devUser.sub as never);
    c.set("serviceId" as never, "superadmin" as never);
    c.set("authType" as never, "cf_access_dev" as never);
    return next();
  }

  // Service token auth (server-to-server)
  const clientId = c.req.header("CF-Access-Client-Id");
  const clientSecret = c.req.header("CF-Access-Client-Secret");
  const expectedId = env.CF_ACCESS_SERVICE_CLIENT_ID;
  const expectedSecret = env.CF_ACCESS_SERVICE_CLIENT_SECRET;
  if (clientId && clientSecret && expectedId && expectedSecret) {
    const isClientIdMatch = await timingSafeEqual(clientId, expectedId);
    const isClientSecretMatch = await timingSafeEqual(
      clientSecret,
      expectedSecret,
    );
    if (isClientIdMatch && isClientSecretMatch) {
      const serviceUser = { email: "service@internal", sub: "service" };
      c.set("cfAccessUser" as never, serviceUser as never);
      c.set("userId" as never, serviceUser.sub as never);
      c.set("serviceId" as never, "superadmin" as never);
      c.set("authType" as never, "cf_access_service" as never);
      return next();
    }
    throw new V2Error("unauthorized", 401, "Invalid service token");
  }

  const aud = env.CF_ACCESS_AUD;
  const team = env.CF_ACCESS_TEAM;

  if (!aud || !team) {
    throw new V2Error("internal_error", 500, "CF Access is not configured");
  }

  // Read JWT from header or cookie
  const jwtFromHeader = c.req.header("Cf-Access-Jwt-Assertion") ?? null;
  const cookieHeader = c.req.header("Cookie") ?? "";
  const jwtFromCookie =
    cookieHeader
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("CF_Authorization="))
      ?.slice("CF_Authorization=".length) ?? null;

  const token = jwtFromHeader ?? jwtFromCookie;

  if (!token) {
    throw new V2Error("unauthorized", 401, "Missing Cloudflare Access token");
  }

  const user = await verifyJwt(token, team, aud);

  if (!user) {
    throw new V2Error("unauthorized", 401, "Invalid or expired Cloudflare Access token");
  }

  c.set("cfAccessUser" as never, user as never);
  c.set("userId" as never, user.sub as never);
  c.set("serviceId" as never, "superadmin" as never);
  c.set("authType" as never, "cf_access" as never);
  return next();
});
