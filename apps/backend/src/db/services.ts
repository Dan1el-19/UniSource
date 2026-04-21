import type { D1Database } from '@cloudflare/workers-types';
import type { AuditEvent, AuditLogListQuery } from '@unisource/sdk';

interface AuditEventRow {
  id: string;
  service_id: string;
  user_id: string;
  action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded';
  resource_type: 'file' | 'folder' | 'service';
  resource_id: string;
  metadata: string | null;
  ip_address: string | null;
  created_at: number;
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    service_id: row.service_id,
    user_id: row.user_id,
    action: row.action,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    ip_address: row.ip_address,
    created_at: row.created_at,
  };
}

export interface ListAuditEventsResult {
  items: AuditEvent[];
  next_cursor: string | null;
  limit: number;
}

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

export async function listAuditEvents(
  db: D1Database,
  serviceId: string,
  query: AuditLogListQuery
): Promise<ListAuditEventsResult> {
  const AUDIT_DEFAULT_LIMIT = 25;
  const AUDIT_MAX_LIMIT = 200;
  const limit = Math.min(query.limit ?? AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT);

  const binds: (string | number)[] = [serviceId];
  const whereClauses: string[] = ['service_id = ?'];

  if (query.user_id) {
    whereClauses.push('user_id = ?');
    binds.push(query.user_id);
  }
  if (query.action) {
    whereClauses.push('action = ?');
    binds.push(query.action);
  }
  if (query.resource_type) {
    whereClauses.push('resource_type = ?');
    binds.push(query.resource_type);
  }
  if (query.cursor) {
    const separatorIndex = query.cursor.indexOf(':');
    if (separatorIndex <= 0) throw new Error('Invalid cursor');
    const cursorTs = Number(query.cursor.slice(0, separatorIndex));
    const cursorId = query.cursor.slice(separatorIndex + 1);
    if (!Number.isInteger(cursorTs) || cursorTs <= 0 || !cursorId) throw new Error('Invalid cursor');
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(cursorTs, cursorTs, cursorId);
  }

  const sql = `
    SELECT * FROM service_user_events
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const result = await db
    .prepare(sql)
    .bind(...binds, limit + 1)
    .all<AuditEventRow>();

  const rows = result.results ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const next_cursor = hasMore && last ? `${last.created_at}:${last.id}` : null;

  return { items: items.map(mapAuditEvent), next_cursor, limit };
}
