-- Folders hierarchy and file records with soft-delete (trash) support
-- Migration 0002 — depends on 0001_uploads.sql

-- Recursive folder hierarchy for user file organization
CREATE TABLE IF NOT EXISTS folders (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  parent_id  TEXT,
  name       TEXT    NOT NULL,
  color_tag  TEXT,
  is_trashed INTEGER NOT NULL DEFAULT 0,
  trashed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id    ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id  ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_is_trashed ON folders(is_trashed);
CREATE INDEX IF NOT EXISTS idx_folders_created    ON folders(created_at);

-- Confirmed file records (created after upload completion)
-- Separate from the `uploads` tracking table which manages presigned URL lifecycle
CREATE TABLE IF NOT EXISTS files (
  id                  TEXT    PRIMARY KEY,
  user_id             TEXT    NOT NULL,
  folder_id           TEXT,
  upload_id           TEXT,
  filename            TEXT    NOT NULL,
  size                INTEGER NOT NULL,
  mime_type           TEXT    NOT NULL,
  storage_destination TEXT    NOT NULL CHECK(storage_destination IN ('r2', 'appwrite')),
  storage_key         TEXT    NOT NULL,
  bucket              TEXT    NOT NULL,
  is_trashed          INTEGER NOT NULL DEFAULT 0,
  trashed_at          INTEGER,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_files_user_id    ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id  ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_is_trashed ON files(is_trashed);
CREATE INDEX IF NOT EXISTS idx_files_upload_id  ON files(upload_id);
CREATE INDEX IF NOT EXISTS idx_files_created    ON files(created_at);
