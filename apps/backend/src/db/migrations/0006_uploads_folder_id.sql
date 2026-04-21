-- Allow callers to specify a target folder at upload-init time.
-- The column is nullable so existing rows are unaffected.
ALTER TABLE uploads ADD COLUMN folder_id TEXT;
