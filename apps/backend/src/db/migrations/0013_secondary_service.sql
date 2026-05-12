-- Align the Service B service id and R2 bucket name with the application config.

UPDATE services
SET default_bucket = 'service-b'
WHERE id = 'service-b';

INSERT INTO services (id, name, default_bucket, max_storage_bytes, max_file_size_bytes)
SELECT 'service-b', name, 'service-b', max_storage_bytes, max_file_size_bytes
FROM services
WHERE id = 'example'
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  default_bucket = excluded.default_bucket,
  max_storage_bytes = excluded.max_storage_bytes,
  max_file_size_bytes = excluded.max_file_size_bytes;
