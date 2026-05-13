-- Migration 0016 — Allow 'hybrid' as recommended_upload_destination

-- SQLite does not support modifying CHECK constraints in place, so we rebuild
-- the `services` table with the new constraint that allows the third option.
-- Existing rows are preserved; the default for new rows remains 'r2'.

PRAGMA foreign_keys = OFF;

CREATE TABLE services_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_bucket TEXT NOT NULL,
  max_storage_bytes INTEGER NOT NULL,
  current_used_bytes INTEGER NOT NULL DEFAULT 0,
  main_used_bytes INTEGER NOT NULL DEFAULT 0,
  max_file_size_bytes INTEGER NOT NULL,
  recommended_upload_destination TEXT NOT NULL DEFAULT 'r2'
    CHECK(recommended_upload_destination IN ('r2', 'appwrite', 'hybrid')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO services_new (
  id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes,
  max_file_size_bytes, recommended_upload_destination, created_at
)
SELECT
  id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes,
  max_file_size_bytes, recommended_upload_destination, created_at
FROM services;

DROP TABLE services;
ALTER TABLE services_new RENAME TO services;

PRAGMA foreign_keys = ON;
