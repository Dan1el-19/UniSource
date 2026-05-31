-- Migration 0019 — Partial indexes covering the v2 file-listing query plans
--
-- Each index targets one (folder scope x sort column) pair. The partial
-- WHERE is_main_storage = 0 keeps internal main-storage rows out of these
-- structures since they never appear in user-facing /v2/files results.
--
-- Expand-only: no DROP, no NOT NULL without DEFAULT — see
-- docs/superpowers/specs/2026-05-23-beta-sdk-release-strategy.md sek. 6.

-- Folder-scoped (WHERE folder_id = ?)
CREATE INDEX IF NOT EXISTS idx_files_v2_folder_created
  ON files(user_id, service_id, folder_id, is_trashed, created_at DESC, id DESC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_folder_updated
  ON files(user_id, service_id, folder_id, is_trashed, updated_at DESC, id DESC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_folder_filename
  ON files(user_id, service_id, folder_id, is_trashed, filename ASC, id ASC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_folder_size
  ON files(user_id, service_id, folder_id, is_trashed, size DESC, id DESC)
  WHERE is_main_storage = 0;

-- Global / root (WHERE folder_id IS NULL OR no folder filter)
CREATE INDEX IF NOT EXISTS idx_files_v2_global_created
  ON files(user_id, service_id, is_trashed, created_at DESC, id DESC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_global_updated
  ON files(user_id, service_id, is_trashed, updated_at DESC, id DESC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_global_filename
  ON files(user_id, service_id, is_trashed, filename ASC, id ASC)
  WHERE is_main_storage = 0;

CREATE INDEX IF NOT EXISTS idx_files_v2_global_size
  ON files(user_id, service_id, is_trashed, size DESC, id DESC)
  WHERE is_main_storage = 0;

ANALYZE;
