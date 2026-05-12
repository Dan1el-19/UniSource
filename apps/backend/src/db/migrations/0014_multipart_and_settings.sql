-- Migration 0014 — Multipart upload support + per-service recommended destination

-- Track whether an upload used single PUT or S3 multipart upload.
ALTER TABLE uploads ADD COLUMN upload_type TEXT NOT NULL DEFAULT 'single'
  CHECK(upload_type IN ('single', 'multipart'));

-- For multipart uploads, stores the R2 (S3) UploadId returned by CreateMultipartUpload.
-- NULL for single PUT uploads.
ALTER TABLE uploads ADD COLUMN r2_upload_id TEXT;

-- Admin-configurable preference shown in the dual-destination upload UI.
-- The frontend uses this value to drive the split button primary action.
ALTER TABLE services ADD COLUMN recommended_upload_destination TEXT NOT NULL DEFAULT 'r2'
  CHECK(recommended_upload_destination IN ('r2', 'appwrite'));

-- Help queries that list pending multipart uploads by R2 UploadId.
CREATE INDEX IF NOT EXISTS idx_uploads_r2_upload_id ON uploads(r2_upload_id) WHERE r2_upload_id IS NOT NULL;
