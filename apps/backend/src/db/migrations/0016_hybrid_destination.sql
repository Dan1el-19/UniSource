-- Migration 0016 — Allow 'hybrid' as recommended_upload_destination

-- D1 keeps foreign key enforcement enabled during migrations. Rebuilding the
-- parent `services` table therefore must preserve child rows explicitly rather
-- than relying on PRAGMA foreign_keys = OFF.

PRAGMA defer_foreign_keys = on;

-- Required parent rows used as safe defaults for existing production data.
INSERT OR IGNORE INTO services (
  id, name, default_bucket, max_storage_bytes, current_used_bytes, main_used_bytes,
  max_file_size_bytes, recommended_upload_destination, created_at
)
VALUES
  (
    'default',
    'UniSource Platform',
    'unisource',
    16106127360,
    0,
    0,
    536870912,
    'r2',
    unixepoch()
  ),
  (
    'service-b',
    'Service B',
    'service-b',
    107374182400,
    0,
    0,
    2147483648,
    'r2',
    unixepoch()
  );

-- Normalize values that would fail the rebuilt CHECK/FK constraints.
UPDATE services
SET recommended_upload_destination = 'r2'
WHERE recommended_upload_destination IS NULL
   OR recommended_upload_destination NOT IN ('r2', 'appwrite', 'hybrid');

UPDATE uploads
SET destination = 'r2'
WHERE destination IS NULL
   OR destination NOT IN ('r2', 'appwrite');

UPDATE uploads
SET upload_type = 'single'
WHERE upload_type IS NULL
   OR upload_type NOT IN ('single', 'multipart');

UPDATE files
SET storage_destination = 'r2'
WHERE storage_destination IS NULL
   OR storage_destination NOT IN ('r2', 'appwrite');

UPDATE uploads
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = uploads.service_id);

UPDATE folders
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = folders.service_id);

UPDATE files
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = files.service_id);

UPDATE share_links
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = share_links.service_id);

UPDATE service_user_events
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = service_user_events.service_id);

UPDATE releases
SET service_id = 'default'
WHERE service_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = releases.service_id);

DROP TABLE IF EXISTS service_users_0016_backup;
DROP TABLE IF EXISTS service_user_events_0016_backup;
DROP TABLE IF EXISTS releases_0016_backup;

CREATE TABLE service_users_0016_backup AS
SELECT
  CASE
    WHEN service_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = service_users.service_id)
    THEN 'default'
    ELSE service_id
  END AS service_id,
  user_id,
  CASE
    WHEN SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) > 0 THEN 'admin'
    WHEN SUM(CASE WHEN role = 'plus' THEN 1 ELSE 0 END) > 0 THEN 'plus'
    ELSE 'user'
  END AS role,
  MIN(created_at) AS created_at,
  MAX(max_storage_bytes) AS max_storage_bytes,
  MAX(current_used_bytes) AS current_used_bytes
FROM service_users
GROUP BY
  CASE
    WHEN service_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = service_users.service_id)
    THEN 'default'
    ELSE service_id
  END,
  user_id;

CREATE TABLE service_user_events_0016_backup AS
SELECT
  id,
  CASE
    WHEN service_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = service_user_events.service_id)
    THEN 'default'
    ELSE service_id
  END AS service_id,
  user_id,
  action,
  resource_type,
  resource_id,
  metadata,
  ip_address,
  created_at,
  actor_id,
  target_user_id
FROM service_user_events;

CREATE TABLE releases_0016_backup AS
SELECT
  id,
  CASE
    WHEN service_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM services WHERE services.id = releases.service_id)
    THEN 'default'
    ELSE service_id
  END AS service_id,
  name,
  size,
  r2_key,
  tags,
  notes,
  force_update,
  uploaded_by,
  upload_status,
  presigned_url,
  presigned_expires_at,
  created_at,
  updated_at,
  r2_upload_id
FROM releases;

-- Drop child tables first so rebuilding the parent table cannot trigger FK
-- cascades or fail on releases.service_id.
DROP TABLE releases;
DROP TABLE service_user_events;
DROP TABLE service_users;

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
  id,
  name,
  default_bucket,
  max_storage_bytes,
  current_used_bytes,
  main_used_bytes,
  max_file_size_bytes,
  recommended_upload_destination,
  created_at
FROM services;

DROP TABLE services;
ALTER TABLE services_new RENAME TO services;

CREATE TABLE service_users (
  service_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  max_storage_bytes INTEGER,
  current_used_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, user_id),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

INSERT INTO service_users (
  service_id, user_id, role, created_at, max_storage_bytes, current_used_bytes
)
SELECT
  service_id,
  user_id,
  COALESCE(role, 'user'),
  COALESCE(created_at, unixepoch()),
  max_storage_bytes,
  COALESCE(current_used_bytes, 0)
FROM service_users_0016_backup;

CREATE INDEX IF NOT EXISTS idx_service_users_lookup
  ON service_users(service_id, user_id);

CREATE INDEX IF NOT EXISTS idx_service_users_role
  ON service_users(service_id, role);

CREATE TABLE service_user_events (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  actor_id TEXT,
  target_user_id TEXT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

INSERT INTO service_user_events (
  id, service_id, user_id, action, resource_type, resource_id, metadata,
  ip_address, created_at, actor_id, target_user_id
)
SELECT
  id,
  service_id,
  user_id,
  action,
  resource_type,
  resource_id,
  metadata,
  ip_address,
  created_at,
  actor_id,
  target_user_id
FROM service_user_events_0016_backup;

CREATE INDEX IF NOT EXISTS idx_service_user_events_svc_user_created
  ON service_user_events(service_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_user_events_resource
  ON service_user_events(resource_type, resource_id, created_at DESC);

CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  force_update INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(upload_status IN ('pending', 'completed', 'failed')),
  presigned_url TEXT,
  presigned_expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  r2_upload_id TEXT,
  FOREIGN KEY (service_id) REFERENCES services(id)
);

INSERT INTO releases (
  id, service_id, name, size, r2_key, tags, notes, force_update, uploaded_by,
  upload_status, presigned_url, presigned_expires_at, created_at, updated_at,
  r2_upload_id
)
SELECT
  id,
  service_id,
  name,
  size,
  r2_key,
  tags,
  notes,
  force_update,
  uploaded_by,
  upload_status,
  presigned_url,
  presigned_expires_at,
  created_at,
  updated_at,
  r2_upload_id
FROM releases_0016_backup;

CREATE INDEX IF NOT EXISTS idx_releases_service_created
  ON releases(service_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_releases_service_status
  ON releases(service_id, upload_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_releases_r2_upload_id
  ON releases(r2_upload_id)
  WHERE r2_upload_id IS NOT NULL;

DROP TABLE service_users_0016_backup;
DROP TABLE service_user_events_0016_backup;
DROP TABLE releases_0016_backup;
