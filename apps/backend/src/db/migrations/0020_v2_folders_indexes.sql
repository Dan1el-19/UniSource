-- Migration 0020 — Partial indexes covering the v2 folder-listing query plans
--
-- Mirrors 0019_v2_files_indexes.sql style. No partial WHERE on is_trashed —
-- bulk-trash/restore masowo flipuje is_trashed i partial WHERE podwoiłaby
-- write amplification. Folders table has no is_main_storage column,
-- so no partial WHERE clause is needed here either.
--
-- Expand-only: no DROP, no NOT NULL without DEFAULT.

-- Parent-scoped (WHERE parent_id = ?)
CREATE INDEX IF NOT EXISTS idx_folders_v2_parent_created
  ON folders(user_id, service_id, parent_id, is_trashed, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_folders_v2_parent_updated
  ON folders(user_id, service_id, parent_id, is_trashed, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_folders_v2_parent_name
  ON folders(user_id, service_id, parent_id, is_trashed, name ASC, id ASC);

-- Global / root (WHERE parent_id IS NULL OR no parent filter)
CREATE INDEX IF NOT EXISTS idx_folders_v2_global_created
  ON folders(user_id, service_id, is_trashed, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_folders_v2_global_updated
  ON folders(user_id, service_id, is_trashed, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_folders_v2_global_name
  ON folders(user_id, service_id, is_trashed, name ASC, id ASC);

ANALYZE;
