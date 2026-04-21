-- Share links: multiple public download links per file
-- slug is globally unique (custom or auto-generated)
-- password_hash uses PBKDF2: stored as "salt_hex:hash_hex"
CREATE TABLE share_links (
  id              TEXT PRIMARY KEY,
  service_id      TEXT NOT NULL,
  file_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,

  slug            TEXT NOT NULL UNIQUE,
  name            TEXT,

  password_hash   TEXT,
  expires_at      INTEGER,

  download_count  INTEGER NOT NULL DEFAULT 0,
  max_downloads   INTEGER,

  is_active       INTEGER NOT NULL DEFAULT 1,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_share_links_slug    ON share_links(slug);
CREATE INDEX idx_share_links_file_id ON share_links(file_id, service_id);
CREATE INDEX idx_share_links_user_id ON share_links(user_id, service_id);
