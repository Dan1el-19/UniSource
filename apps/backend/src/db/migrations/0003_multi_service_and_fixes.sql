-- Migration 0003 — Multi-Service Architecture & Fixes

-- 1. Create main services table
CREATE TABLE IF NOT EXISTS services (
  id                  TEXT    PRIMARY KEY,
  name                TEXT    NOT NULL,
  default_bucket      TEXT    NOT NULL,
  max_storage_bytes   INTEGER NOT NULL DEFAULT 10737418240, -- 10GB default
  current_used_bytes  INTEGER NOT NULL DEFAULT 0,
  max_file_size_bytes INTEGER NOT NULL DEFAULT 536870912, -- 500MB
  created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2. Create the mapping table linking Appwrite UUIDs to services
CREATE TABLE IF NOT EXISTS service_users (
  service_id TEXT    NOT NULL,
  user_id    TEXT    NOT NULL,
  role       TEXT    NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (service_id, user_id),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- 3. Seed default services
INSERT INTO services (id, name, default_bucket, max_storage_bytes, max_file_size_bytes)
VALUES 
  ('default', 'UniSource Platform', 'unisource', 16106127360, 536870912),
  ('service-b', 'Service B', 'service-b', 107374182400, 2147483648)
ON CONFLICT(id) DO NOTHING;

-- 4. Add service_id isolation columns to operational tables
ALTER TABLE uploads ADD COLUMN service_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE uploads ADD COLUMN user_id TEXT;  -- fixes critical bug #15 (upload owner check)

ALTER TABLE folders ADD COLUMN service_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE files ADD COLUMN service_id TEXT NOT NULL DEFAULT 'default';

-- 5. Create new Indexes for Service Isolation
CREATE INDEX IF NOT EXISTS idx_uploads_service_user ON uploads(service_id, user_id);
CREATE INDEX IF NOT EXISTS idx_folders_service_user ON folders(service_id, user_id);
CREATE INDEX IF NOT EXISTS idx_files_service_user ON files(service_id, user_id);

-- 6. Add UNIQUE constraint to upload_id in files table to prevent duplicate 'complete' triggers
CREATE UNIQUE INDEX IF NOT EXISTS idx_files_unique_upload_id ON files(upload_id) WHERE upload_id IS NOT NULL;
