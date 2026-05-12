-- Align the Chmura Blokserwis service id and R2 bucket name with the application config.

UPDATE services
SET default_bucket = 'chmura-blokserwis'
WHERE id = 'chmura-blokserwis';

INSERT INTO services (id, name, default_bucket, max_storage_bytes, max_file_size_bytes)
SELECT 'chmura-blokserwis', name, 'chmura-blokserwis', max_storage_bytes, max_file_size_bytes
FROM services
WHERE id = 'blokserwis'
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  default_bucket = excluded.default_bucket,
  max_storage_bytes = excluded.max_storage_bytes,
  max_file_size_bytes = excluded.max_file_size_bytes;
