import type { D1Database } from '@cloudflare/workers-types';

export interface ServiceRecord {
  id: string;
  name: string;
  default_bucket: string;
  max_storage_bytes: number;
  current_used_bytes: number;
  max_file_size_bytes: number;
  created_at: number;
}

export interface ServiceUserRecord {
  service_id: string;
  user_id: string;
  role: string;
  created_at: number;
}

export async function checkUserServiceAccess(
  db: D1Database,
  serviceId: string,
  userId: string
): Promise<ServiceUserRecord | null> {
  const result = await db
    .prepare('SELECT * FROM service_users WHERE service_id = ? AND user_id = ?')
    .bind(serviceId, userId)
    .first<ServiceUserRecord>();
  return result ?? null;
}

export async function getServiceDetails(
  db: D1Database,
  serviceId: string
): Promise<ServiceRecord | null> {
  const result = await db
    .prepare('SELECT * FROM services WHERE id = ?')
    .bind(serviceId)
    .first<ServiceRecord>();
  return result ?? null;
}

// Atomically checks quota and reserves space to prevent race conditions during concurrent uploads.
// Returns true if quota was reserved successfully, false if quota exceeded.
export async function reserveQuota(
  db: D1Database,
  serviceId: string,
  additionalBytes: number
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE services 
       SET current_used_bytes = current_used_bytes + ? 
       WHERE id = ? AND (current_used_bytes + ?) <= max_storage_bytes`
    )
    .bind(additionalBytes, serviceId, additionalBytes)
    .run();
    
  return (result.meta.changes ?? 0) > 0;
}

// Note: incrementServiceUsage was replaced by reserveQuota which atomically checks and reserves space.

// Called after permanent physical deletion — decrements counter, never goes below 0
export async function decrementServiceUsage(
  db: D1Database,
  serviceId: string,
  bytes: number
): Promise<void> {
  await db
    .prepare('UPDATE services SET current_used_bytes = MAX(0, current_used_bytes - ?) WHERE id = ?')
    .bind(bytes, serviceId)
    .run();
}

export interface LogEventInput {
  serviceId: string;
  userId: string;
  action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded';
  resourceType: 'file' | 'folder' | 'service';
  resourceId: string;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
}

// Logs an audit event for B2B dashboards
export async function logServiceEvent(
  db: D1Database,
  input: LogEventInput
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const metadataStr = input.metadata ? JSON.stringify(input.metadata) : null;

  await db
    .prepare(
      `INSERT INTO service_user_events 
       (id, service_id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.serviceId,
      input.userId,
      input.action,
      input.resourceType,
      input.resourceId,
      metadataStr,
      input.ipAddress ?? null,
      now
    )
    .run();
}
