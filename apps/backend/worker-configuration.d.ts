// Cloudflare Worker bindings (injected by Wrangler)
declare interface CloudflareBindings {
  APP_DB: D1Database;
  PRIMARY_BUCKET: R2Bucket;
  SECONDARY_BUCKET: R2Bucket;
  RATE_LIMITER: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  // Secrets injected at runtime via `wrangler secret put` — one API key per service
  SERVICE_API_KEY: string;
  SECONDARY_SERVICE_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_BUCKET_ID: string;
  APPWRITE_API_KEY: string;
}

// Context variables set by authMiddleware — used as Hono Variables generic
declare interface WorkerVariables {
  userId: string;
  serviceId: string;
  authType: 'appwrite' | 'apikey';
  isAdmin: boolean;
  actorId?: string;
  /** The Appwrite JWT used to authenticate this request. Set only for JWT-authenticated requests. */
  appwriteJwt?: string;
}
