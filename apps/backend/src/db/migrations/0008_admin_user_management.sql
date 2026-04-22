ALTER TABLE service_users ADD COLUMN max_storage_bytes INTEGER;
ALTER TABLE service_users ADD COLUMN current_used_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_service_users_role
  ON service_users(service_id, role);
