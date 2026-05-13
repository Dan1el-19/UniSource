-- Migration 0015 — Multipart upload support for releases

-- For multipart release uploads, stores the R2 (S3) UploadId returned by CreateMultipartUpload.
-- NULL for single PUT releases (the existing flow via /releases/upload/init).
ALTER TABLE releases ADD COLUMN r2_upload_id TEXT;

-- Help queries that resolve a pending multipart release by R2 UploadId.
CREATE INDEX IF NOT EXISTS idx_releases_r2_upload_id
  ON releases(r2_upload_id)
  WHERE r2_upload_id IS NOT NULL;
