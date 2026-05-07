import { createMiddleware } from 'hono/factory';
import { Client, Account } from 'node-appwrite';
import { checkUserServiceAccess } from '../db/services';
import { isKnownServiceId, getServiceConfig, DEFAULT_SERVICE_ID } from '../config/services';

export type AuthRouteMode = 'user' | 'dual';

export interface AuthDecision {
  routeMode: AuthRouteMode;
  jwtToken: string | null;
  apiKeyToken: string | null;
}

function getAuthRouteMode(pathname: string): AuthRouteMode {
  if (
    pathname.startsWith('/upload') ||
    pathname.startsWith('/files') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/releases')
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

  // Derive service from header — treat as hint, ALWAYS verify access below
  const rawServiceId = c.req.header('X-Service-ID')?.trim().toLowerCase();

  if (rawServiceId && !isKnownServiceId(rawServiceId)) {
    return c.json({ error: 'Bad Request', message: `Unknown service: ${rawServiceId}` }, 400);
  }

  const serviceId = rawServiceId ?? DEFAULT_SERVICE_ID;

  if (jwtToken) {
    const authenticatedUser = await authenticateAppwriteJwt(c.env, jwtToken);

    if (authenticatedUser) {
      // Non-default services require explicit service_users membership
      // This prevents a usrc.dev account from accessing blokserwis data
      if (serviceId !== DEFAULT_SERVICE_ID) {
        const access = await checkUserServiceAccess(c.env.usrc_d1, serviceId, authenticatedUser.userId);
        if (!access) {
          return c.json({ error: 'Forbidden', message: 'Access to this service is not permitted' }, 403);
        }
      }

      c.set('userId', authenticatedUser.userId);
      c.set('serviceId', serviceId);
      c.set('authType', 'appwrite');
      c.set('isAdmin', authenticatedUser.labels.includes('admin'));
      return next();
    }

    if (routeMode === 'user') {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid credentials' }, 401);
    }
  }

  // Path B: Service-scoped static API key (Astro SSR / server-to-server / cron)
  // Each service has its own secret: USRC_API_KEY, BLOKSERWIS_API_KEY, etc.
  if (routeMode === 'dual' && apiKeyToken) {
    const config = getServiceConfig(serviceId)!;
    const expectedKey = (c.env as unknown as Record<string, string | undefined>)[config.apiKeyEnvVar];

    if (expectedKey && apiKeyToken === expectedKey) {
      c.set('userId', 'system');
      c.set('serviceId', serviceId);
      c.set('authType', 'apikey');
      c.set('isAdmin', true);
      return next();
    }
  }

  return c.json({ error: 'Unauthorized', message: 'Missing or invalid credentials' }, 401);
});
