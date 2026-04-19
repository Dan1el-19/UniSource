-- Down migration for 0003_multi_service_and_fixes.sql

-- D1 does not support dropping columns easily, you would need to recreate the tables.
-- This script drops the multi-service specific tables and indexes.

-- Remove unique constraint added in 0003
DROP INDEX IF EXISTS idx_files_upload_id_unique;

-- Remove multi-service config tables
DROP TABLE IF EXISTS service_users;
DROP TABLE IF EXISTS services;
