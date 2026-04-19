-- Migration 0004 — Composite indexes for multi-service query performance
-- Run after 0003_multi_service_and_fixes.sql

-- Composite indexes for folder listing (most common query: user files in a service)
CREATE INDEX IF NOT EXISTS idx_folders_svc_user_parent_trashed
  ON folders(service_id, user_id, parent_id, is_trashed);

CREATE INDEX IF NOT EXISTS idx_folders_svc_user_trashed_created
  ON folders(service_id, user_id, is_trashed, created_at DESC);

-- Composite indexes for file listing (browse by folder, trash, pagination)
CREATE INDEX IF NOT EXISTS idx_files_svc_user_folder_trashed_created
  ON files(service_id, user_id, folder_id, is_trashed, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_files_svc_user_trashed_created
  ON files(service_id, user_id, is_trashed, created_at DESC);

-- Composite index for service_users lookups (auth hot-path)
CREATE INDEX IF NOT EXISTS idx_service_users_lookup
  ON service_users(service_id, user_id);

-- Index for upload owner verification (fix critical bug #15)
CREATE INDEX IF NOT EXISTS idx_uploads_svc_user_status
  ON uploads(service_id, user_id, status);
