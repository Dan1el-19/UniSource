-- Migration 0018 — Add object_key_prefix to services for dynamic R2 storage layout
-- Replaces the hardcoded objectKeyPrefix from SERVICES dict in src/config/services.ts.

ALTER TABLE services ADD COLUMN object_key_prefix TEXT NOT NULL DEFAULT '';

-- Seed existing services with the prefixes that previously lived in the SERVICES map
UPDATE services SET object_key_prefix = 'usrc' WHERE id = 'usrc';
-- chmura-blokserwis and com-blokserwis-db keep '' (their previous behaviour)
