-- Migration 0021 — Superadmin V2 cursor pagination indexes

CREATE INDEX IF NOT EXISTS idx_services_superadmin_created_id
  ON services(created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_services_superadmin_name_id
  ON services(name ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_api_keys_superadmin_service_created_id
  ON api_keys(service_id, is_account_level, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_api_keys_superadmin_account_created_id
  ON api_keys(is_account_level, created_at DESC, id DESC);
