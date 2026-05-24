/// <reference path="./src/types/worker.d.ts" />

// Cloudflare Worker bindings (injected by Wrangler)
declare interface CloudflareBindings {
  APP_DB: D1Database;
  PRIMARY_BUCKET: R2Bucket;
  SECONDARY_BUCKET?: R2Bucket;
  /**
   * Cloudflare Rate Limiting bindings — one namespace per traffic class so
   * different endpoint families don't share a counter. Configured in
   * `wrangler.jsonc` under `ratelimits`. All are optional at the type level
   * because tests / `wrangler dev` may run without them; the middleware
   * passes through cleanly when a binding is absent.
   */
  RL_GENERAL?: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  RL_UPLOAD_INIT?: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  RL_PUBLIC_READ?: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  RL_AUTH_FAIL?: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  RL_SHARE_PASSWORD?: { limit: (config: { key: string }) => Promise<{ success: boolean }> };
  R2_BUCKET_BINDINGS: string;
  R2_BUCKET_NAMES: string;
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
  /**
   * HMAC secret for signing v2 API cursors. Must be at least 32 characters.
   * Set via `wrangler secret put CURSOR_HMAC_SECRET`.
   */
  CURSOR_HMAC_SECRET?: string;
  /**
   * V2 API logging sample rate (0.0-1.0). Errors always logged. Default: 0.1
   */
  V2_LOG_SAMPLE_RATE?: string;
}
