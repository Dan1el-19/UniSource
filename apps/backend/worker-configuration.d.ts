// Cloudflare Worker bindings (injected by Wrangler)
declare interface CloudflareBindings {
  usrc_d1: D1Database;
  USRC_BUCKET: R2Bucket;
  CHMURA_BLOKSERWIS_BUCKET: R2Bucket;
  RATE_LIMITER: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  // Secrets injected at runtime via `wrangler secret put` — one API key per service
  USRC_API_KEY: string;
  CHMURA_BLOKSERWIS_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_BUCKET_ID: string;
  APPWRITE_API_KEY: string;
  /**
   * S2: Dedicated HMAC secret used to sign public download tokens.
   * Optional — falls back to deriving from APPWRITE_API_KEY when missing.
   * Provision via `wrangler secret put DOWNLOAD_TOKEN_SECRET`.
   */
  DOWNLOAD_TOKEN_SECRET?: string;
  /**
   * S8: Comma-separated list of allowed CORS origins. When unset, falls back
   * to the first-party defaults baked into `index.ts`.
   */
  ALLOWED_ORIGINS?: string;
  /**
   * Cloudflare Access audience tag for /superadmin/* JWT verification.
   * Required in production. Set via `wrangler secret put CF_ACCESS_AUD`.
   */
  CF_ACCESS_AUD?: string;
  /**
   * Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com".
   * Required in production. Set via `wrangler secret put CF_ACCESS_TEAM`.
   */
  CF_ACCESS_TEAM?: string;
  /**
   * When set to "true", bypasses CF Access JWT verification for local dev.
   * MUST NOT be set in production.
   */
  BYPASS_CF_ACCESS?: string;
  /**
   * When set to "true", enables legacy env-var API key fallback in auth middleware.
   */
  LEGACY_API_KEYS_ENABLED?: string;
}

// Context variables set by authMiddleware — used as Hono Variables generic
declare interface WorkerVariables {
  userId: string;
  serviceId: string;
  authType: 'appwrite' | 'apikey';
  isAdmin: boolean;
  /**
   * Role of the authenticated user against the resolved service. `system`
   * indicates an API-key authenticated request (server-to-server).
   */
  serviceRole?: 'user' | 'plus' | 'admin' | 'system';
  actorId?: string;
  /** The Appwrite JWT used to authenticate this request. Set only for JWT-authenticated requests. */
  appwriteJwt?: string;
}
