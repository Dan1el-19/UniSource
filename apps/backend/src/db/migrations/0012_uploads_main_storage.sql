-- Persist main storage intent on upload sessions.
ALTER TABLE uploads ADD COLUMN is_main_storage INTEGER NOT NULL DEFAULT 0;

-- Rebuild listing index to match cursor pagination and trash filtering.
DROP INDEX IF EXISTS idx_files_main_storage;
CREATE INDEX idx_files_main_storage
  ON files(service_id, is_main_storage, is_trashed, created_at DESC, id DESC)
  WHERE is_main_storage = 1;
