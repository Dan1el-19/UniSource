import { createMiddleware } from 'hono/factory';
import { Client, Account } from 'node-appwrite';
import { checkUserServiceAccess, getServiceDetails, type ServiceRecord } from '../db/services';
import { DEFAULT_SERVICE_ID } from '../config/services';
import { validateApiKeyByHash } from '../db/apiKeys';
import { consumeRateLimit } from './ratelimit';
import { V2Error } from '../lib/v2/errors';

export type AuthRouteMode = 'user' | 'dual';

export interface AuthDecision {
  routeMode: AuthRouteMode;
  jwtToken: string | null;
  apiKeyToken: string | null;
}

function getAuthRouteMode(pathname: string): AuthRouteMode {
  if (
    pathname.startsWith('/upload') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/main') ||
    pathname.startsWith('/releases') ||
    pathname.startsWith('/app') ||
    pathname.startsWith('/v2')
  ) {
    return 'dual';
  }

  return 'user';
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export function resolveAuthDecision(
  pathname: string,
  authorizationHeader: string | null,
  appwriteJwtHeader: string | null
): AuthDecision {
  const routeMode = getAuthRouteMode(pathname);
  const bearerToken = extractBearerToken(authorizationHeader);
  const explicitJwt = appwriteJwtHeader?.trim() || null;

  if (explicitJwt) {
    return {
      routeMode,
      jwtToken: explicitJwt,
      apiKeyToken: routeMode === 'dual' ? bearerToken : null,
    };
  }

  if (!bearerToken) {
    return {
      routeMode,
      jwtToken: null,
      apiKeyToken: null,
    };
  }

  if (routeMode === 'user') {
    return {
      routeMode,
      jwtToken: bearerToken,
      apiKeyToken: null,
    };
  }

  if (looksLikeJwt(bearerToken)) {
    return {
      routeMode,
      jwtToken: bearerToken,
      apiKeyToken: bearerToken,
    };
  }

  return {
    routeMode,
    jwtToken: null,
    apiKeyToken: bearerToken,
  };
}

async function authenticateAppwriteJwt(
  env: CloudflareBindings,
  jwt: string
): Promise<{ userId: string; labels: string[] } | null> {
  try {
    const client = new Client()
      .setEndpoint(env.APPWRITE_ENDPOINT)
      .setProject(env.APPWRITE_PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(client);
    const user = await account.get();
    return {
      userId: user.$id,
      labels: Array.isArray(user.labels) ? user.labels : [],
    };
  } catch {
    return null;
  }
}

export const authMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  const { routeMode, jwtToken, apiKeyToken } = resolveAuthDecision(
    pathname,
    c.req.header('Authorization') ?? null,
    c.req.header('X-Appwrite-JWT') ?? null
  );

  // Derive service from header — strictly required
  const rawServiceId = c.req.header('X-Service-ID')?.trim().toLowerCase();
  if (!rawServiceId) {
    throw new V2Error('validation_error', 400, 'X-Service-ID header is required');
  }
  const serviceId = rawServiceId;

  const service = await getServiceDetails(c.env.APP_DB, serviceId);
  if (!service) {
    throw new V2Error('validation_error', 400, `Unknown service: ${serviceId}`);
  }
  c.set('service', service);

  if (jwtToken) {
    const authenticatedUser = await authenticateAppwriteJwt(c.env, jwtToken);

    if (authenticatedUser) {
      // Non-default services require explicit service_users membership
      // This prevents a app.example.com account from accessing service-b data
      let serviceRole: 'user' | 'plus' | 'admin' = authenticatedUser.labels.includes('admin')
        ? 'admin'
        : 'user';

      if (serviceId !== DEFAULT_SERVICE_ID) {
        const access = await checkUserServiceAccess(c.env.APP_DB, serviceId, authenticatedUser.userId);
        if (!access) {
          throw new V2Error('forbidden', 403, 'Access to this service is not permitted');
        }
        // Per-service role overrides Appwrite labels for non-default services.
        if (access.role === 'admin' || access.role === 'plus' || access.role === 'user') {
          serviceRole = access.role;
        }
      } else {
        // Default service still benefits from a stored per-service role when present.
        const access = await checkUserServiceAccess(c.env.APP_DB, serviceId, authenticatedUser.userId);
        if (access && (access.role === 'admin' || access.role === 'plus' || access.role === 'user')) {
          serviceRole = access.role;
        }
      }

      c.set('userId', authenticatedUser.userId);
      c.set('serviceId', serviceId);
      c.set('authType', 'appwrite');
      c.set('isAdmin', serviceRole === 'admin');
      c.set('serviceRole', serviceRole);
      c.set('appwriteJwt', jwtToken);
      return next();
    }

    if (routeMode === 'user') {
      const limit = await consumeRateLimit(c, 'auth-fail');
      if (!limit.allowed) {
        throw new V2Error('rate_limited', 429, 'Too many failed auth attempts. Please try again later.');
      }
      throw new V2Error('unauthorized', 401, 'Missing or invalid credentials');
    }
  }

  // Path B: API key authentication
  if (routeMode === 'dual' && apiKeyToken) {
    // Step 1: Try D1 api_keys lookup by SHA-256 hash
    const d1Key = await validateApiKeyByHash(c.env.APP_DB, apiKeyToken, serviceId);

    if (d1Key) {
      c.set('userId', 'system');
      c.set('serviceId', serviceId);
      c.set('authType', 'apikey');
      c.set('isAdmin', d1Key.permissions.includes('admin'));
      c.set('serviceRole', 'system');
      c.set('apiKeyId', d1Key.id);
      c.set('apiKeyPermissions', d1Key.permissions);
      return next();
    }
  }

  // All authentication attempts failed. Bump the auth-fail rate limiter so a
  // burst of bad tokens from one IP gets blocked before it can probe further.
  // We bump *after* the auth attempt rather than before so legitimate users
  // who briefly mistype a header don't get throttled by the same IP's earlier
  // success traffic — only failures count.
  const limit = await consumeRateLimit(c, 'auth-fail');
  if (!limit.allowed) {
    throw new V2Error('rate_limited', 429, 'Too many failed auth attempts. Please try again later.');
  }

  throw new V2Error('unauthorized', 401, 'Missing or invalid credentials');
});
