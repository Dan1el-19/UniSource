-- Migration 0017 — API keys, account_key_services, service_cors, cloudflare_config

-- Add cloudflare_config column to services (nullable JSON text)
ALTER TABLE services ADD COLUMN cloudflare_config TEXT;

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL,
  cors_origins TEXT,
  is_account_level INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  revoked_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_api_keys_service_id ON api_keys(service_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_account_level ON api_keys(is_account_level);

-- Account-level key → service mapping
CREATE TABLE IF NOT EXISTS account_key_services (
  key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, service_id)
);

-- Per-service CORS origins
CREATE TABLE IF NOT EXISTS service_cors (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (service_id, origin)
);

CREATE INDEX IF NOT EXISTS idx_service_cors_service_id ON service_cors(service_id);
