CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',    -- JSON array stored as string
  notes TEXT,
  force_update INTEGER NOT NULL DEFAULT 0,  -- boolean: 0 or 1
  uploaded_by TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(upload_status IN ('pending', 'completed', 'failed')),
  presigned_url TEXT,
  presigned_expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX idx_releases_service_created
  ON releases(service_id, created_at DESC);

CREATE INDEX idx_releases_service_status
  ON releases(service_id, upload_status, created_at DESC);
