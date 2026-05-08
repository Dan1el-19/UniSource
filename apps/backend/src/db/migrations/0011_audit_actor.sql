-- Migration 0011 — Add actor fields to audit log
-- Supports admin preview: actor_id = the real admin, target_user_id = the impersonated user
ALTER TABLE service_user_events ADD COLUMN actor_id TEXT;
ALTER TABLE service_user_events ADD COLUMN target_user_id TEXT;
