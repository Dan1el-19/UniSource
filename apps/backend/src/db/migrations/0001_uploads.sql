-- Upload tracking table for the gateway pattern
-- Files never pass through the worker; this table tracks presigned URL lifecycles

CREATE TABLE IF NOT EXISTS uploads (
  id            TEXT    PRIMARY KEY,
  filename      TEXT    NOT NULL,
  size          INTEGER NOT NULL,
  mime_type     TEXT    NOT NULL,
  destination   TEXT    NOT NULL CHECK(destination IN ('r2', 'appwrite')),
  storage_key   TEXT    NOT NULL,
  bucket        TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'completed', 'failed')),
  presigned_url TEXT,
  expires_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_uploads_status   ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_expires  ON uploads(expires_at);
CREATE INDEX IF NOT EXISTS idx_uploads_created  ON uploads(created_at);
