-- Ensure the example secondary service row exists for local/demo databases.

INSERT INTO services (id, name, default_bucket, max_storage_bytes, max_file_size_bytes)
VALUES ('service-b', 'Example Service B', 'service-b', 107374182400, 2147483648)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  default_bucket = excluded.default_bucket,
  max_storage_bytes = excluded.max_storage_bytes,
  max_file_size_bytes = excluded.max_file_size_bytes;
