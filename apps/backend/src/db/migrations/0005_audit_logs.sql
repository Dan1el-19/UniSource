-- Migration 0005 — Audit Logs (service_user_events)
-- Run after 0004_composite_indexes.sql

-- Tracks sensitive actions within a service (e.g. uploading, deleting files)
CREATE TABLE IF NOT EXISTS service_user_events (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'upload_completed', 'file_deleted', 'folder_created'
  resource_type TEXT NOT NULL, -- e.g. 'file', 'folder'
  resource_id TEXT NOT NULL,
  metadata TEXT, -- JSON string containing additional info (sizes, names, etc.)
  ip_address TEXT,
  created_at INTEGER NOT NULL,
  
  -- Prevent orphans when a service is removed
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- Index for querying audit logs by service and user efficiently
CREATE INDEX IF NOT EXISTS idx_service_user_events_svc_user_created 
  ON service_user_events(service_id, user_id, created_at DESC);

-- Index for searching history of a specific resource
CREATE INDEX IF NOT EXISTS idx_service_user_events_resource
  ON service_user_events(resource_type, resource_id, created_at DESC);
