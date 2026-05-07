-- Add main storage flag to files
ALTER TABLE files ADD COLUMN is_main_storage INTEGER NOT NULL DEFAULT 0;

-- Add main storage quota counter to services
ALTER TABLE services ADD COLUMN main_used_bytes INTEGER NOT NULL DEFAULT 0;

-- Index for MAIN_STORAGE listing
CREATE INDEX idx_files_main_storage
  ON files(service_id, is_main_storage, created_at DESC)
  WHERE is_main_storage = 1;
