declare interface CloudflareBindings {
  APP_DB: D1Database;
  PRIMARY_BUCKET: R2Bucket;
  // Secrets injected at runtime via `wrangler secret put`
  SERVICE_API_KEY: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_BUCKET_ID: string;
  APPWRITE_API_KEY: string;
}