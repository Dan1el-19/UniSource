import type { D1Database } from '@cloudflare/workers-types';
import type { AuditEvent, AuditLogListQuery } from '@unisource/sdk';

interface AuditEventRow {
  id: string;
  service_id: string;
  user_id: string;
  action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed' | 'quota_reconciled';
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
  main_used_bytes: number;
  max_file_size_bytes: number;
  created_at: number;
}

export interface ServiceUserRecord {
  service_id: string;
  user_id: string;
  role: string;
  max_storage_bytes: number | null;
  current_used_bytes: number;
  created_at: number;
}

interface UserUsageRow {
  user_id: string;
  used_bytes: number | null;
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

export async function getServiceUser(
  db: D1Database,
  serviceId: string,
  userId: string
): Promise<ServiceUserRecord | null> {
  return checkUserServiceAccess(db, serviceId, userId);
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

export async function updateServiceDetails(
  db: D1Database,
  serviceId: string,
  updates: {
    max_storage_bytes: number;
    max_file_size_bytes: number;
  }
): Promise<ServiceRecord | null> {
  const result = await db
    .prepare(
      `UPDATE services
       SET max_storage_bytes = ?, max_file_size_bytes = ?
       WHERE id = ?`
    )
    .bind(updates.max_storage_bytes, updates.max_file_size_bytes, serviceId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  return getServiceDetails(db, serviceId);
}

export async function getUserStorageUsage(
  db: D1Database,
  serviceId: string,
  userId: string
): Promise<number> {
  const result = await db
    .prepare(
      `SELECT COALESCE(SUM(size), 0) AS used_bytes
       FROM files
       WHERE service_id = ? AND user_id = ?`
    )
    .bind(serviceId, userId)
    .first<{ used_bytes: number | null }>();

  return Number(result?.used_bytes ?? 0);
}

export async function listUserStorageUsageByService(
  db: D1Database,
  serviceId: string
): Promise<Record<string, number>> {
  const result = await db
    .prepare(
      `SELECT user_id, COALESCE(SUM(size), 0) AS used_bytes
       FROM files
       WHERE service_id = ?
       GROUP BY user_id`
    )
    .bind(serviceId)
    .all<UserUsageRow>();

  const usageMap: Record<string, number> = {};
  for (const row of result.results ?? []) {
    usageMap[row.user_id] = Number(row.used_bytes ?? 0);
  }
  return usageMap;
}

export async function listServiceUsersByService(
  db: D1Database,
  serviceId: string
): Promise<ServiceUserRecord[]> {
  const result = await db
    .prepare('SELECT * FROM service_users WHERE service_id = ? ORDER BY created_at DESC')
    .bind(serviceId)
    .all<ServiceUserRecord>();

  return result.results ?? [];
}

export async function ensureServiceUser(
  db: D1Database,
  serviceId: string,
  userId: string,
  role = 'user'
): Promise<ServiceUserRecord> {
  const currentUsedBytes = await getUserStorageUsage(db, serviceId, userId);

  await db
    .prepare(
      `INSERT INTO service_users (service_id, user_id, role, max_storage_bytes, current_used_bytes, created_at)
       VALUES (?, ?, ?, NULL, ?, unixepoch())
       ON CONFLICT(service_id, user_id) DO UPDATE SET current_used_bytes = excluded.current_used_bytes`
    )
    .bind(serviceId, userId, role, currentUsedBytes)
    .run();

  const record = await getServiceUser(db, serviceId, userId);
  if (!record) {
    throw new Error('Unable to ensure service user');
  }

  return record;
}

export async function upsertServiceUserSettings(
  db: D1Database,
  input: {
    serviceId: string;
    userId: string;
    role: string;
    max_storage_bytes: number | null;
  }
): Promise<ServiceUserRecord> {
  const currentUsedBytes = await getUserStorageUsage(db, input.serviceId, input.userId);

  await db
    .prepare(
      `INSERT INTO service_users (service_id, user_id, role, max_storage_bytes, current_used_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(service_id, user_id) DO UPDATE SET
         role = excluded.role,
         max_storage_bytes = excluded.max_storage_bytes,
         current_used_bytes = excluded.current_used_bytes`
    )
    .bind(input.serviceId, input.userId, input.role, input.max_storage_bytes, currentUsedBytes)
    .run();

  const record = await getServiceUser(db, input.serviceId, input.userId);
  if (!record) {
    throw new Error('Unable to update service user settings');
  }

  return record;
}

async function decrementUserStorageUsage(
  db: D1Database,
  serviceId: string,
  userId: string,
  bytes: number
): Promise<void> {
  await db
    .prepare(
      `UPDATE service_users
       SET current_used_bytes = MAX(0, current_used_bytes - ?)
       WHERE service_id = ? AND user_id = ?`
    )
    .bind(bytes, serviceId, userId)
    .run();
}

// Atomically checks quota and reserves space to prevent race conditions during concurrent uploads.
// Returns true if quota was reserved successfully, false if quota exceeded.
export async function reserveQuota(
  db: D1Database,
  serviceId: string,
  additionalBytes: number,
  userId?: string | null
): Promise<{ ok: true } | { ok: false; scope: 'service' | 'user' }> {
  if (userId) {
    const userRecord = await ensureServiceUser(db, serviceId, userId);
    const userResult =
      userRecord.max_storage_bytes === null
        ? await db
            .prepare(
              `UPDATE service_users
               SET current_used_bytes = current_used_bytes + ?
               WHERE service_id = ? AND user_id = ?`
            )
            .bind(additionalBytes, serviceId, userId)
            .run()
        : await db
            .prepare(
              `UPDATE service_users
               SET current_used_bytes = current_used_bytes + ?
               WHERE service_id = ? AND user_id = ? AND (current_used_bytes + ?) <= max_storage_bytes`
            )
            .bind(additionalBytes, serviceId, userId, additionalBytes)
            .run();

    if ((userResult.meta.changes ?? 0) === 0) {
      return { ok: false, scope: 'user' };
    }
  }

  const result = await db
    .prepare(
      `UPDATE services 
       SET current_used_bytes = current_used_bytes + ? 
       WHERE id = ? AND (current_used_bytes + ?) <= max_storage_bytes`
    )
    .bind(additionalBytes, serviceId, additionalBytes)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    if (userId) {
      await decrementUserStorageUsage(db, serviceId, userId, additionalBytes);
    }
    return { ok: false, scope: 'service' };
  }

  return { ok: true };
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

export async function releaseQuota(
  db: D1Database,
  serviceId: string,
  bytes: number,
  userId?: string | null
): Promise<void> {
  await decrementServiceUsage(db, serviceId, bytes);

  if (userId) {
    await decrementUserStorageUsage(db, serviceId, userId, bytes);
  }
}

export async function reserveMainStorageQuota(
  db: D1Database,
  serviceId: string,
  bytes: number
): Promise<{ ok: boolean }> {
  const result = await db
    .prepare(
      `UPDATE services
       SET main_used_bytes = main_used_bytes + ?
       WHERE id = ? AND (main_used_bytes + ?) <= max_storage_bytes`
    )
    .bind(bytes, serviceId, bytes)
    .run();
  return { ok: (result.meta.changes ?? 0) > 0 };
}

export async function releaseMainStorageQuota(
  db: D1Database,
  serviceId: string,
  bytes: number
): Promise<void> {
  await db
    .prepare('UPDATE services SET main_used_bytes = MAX(0, main_used_bytes - ?) WHERE id = ?')
    .bind(bytes, serviceId)
    .run();
}

export interface ReconcileQuotaResult {
  service_drift_bytes: number;
  service_corrected: boolean;
  users_fixed: number;
  dry_run: boolean;
}

export async function reconcileQuota(
  db: D1Database,
  serviceId: string,
  dryRun = false
): Promise<ReconcileQuotaResult> {
  const serviceUsageRow = await db
    .prepare('SELECT COALESCE(SUM(size), 0) AS used_bytes FROM files WHERE service_id = ? AND is_trashed = 0')
    .bind(serviceId)
    .first<{ used_bytes: number | null }>();
  const realServiceBytes = Number(serviceUsageRow?.used_bytes ?? 0);

  const userUsageRows = await db
    .prepare(
      'SELECT user_id, COALESCE(SUM(size), 0) AS used_bytes FROM files WHERE service_id = ? AND is_trashed = 0 GROUP BY user_id'
    )
    .bind(serviceId)
    .all<UserUsageRow>();

  const serviceRow = await db
    .prepare('SELECT current_used_bytes FROM services WHERE id = ?')
    .bind(serviceId)
    .first<{ current_used_bytes: number }>();
  const storedServiceBytes = Number(serviceRow?.current_used_bytes ?? 0);

  const storedUserRows = await db
    .prepare('SELECT user_id, current_used_bytes FROM service_users WHERE service_id = ?')
    .bind(serviceId)
    .all<{ user_id: string; current_used_bytes: number }>();
  const storedUserMap: Record<string, number> = {};
  for (const row of storedUserRows.results ?? []) {
    storedUserMap[row.user_id] = Number(row.current_used_bytes);
  }

  const serviceDrift = realServiceBytes - storedServiceBytes;

  if (serviceDrift !== 0 && !dryRun) {
    await db
      .prepare('UPDATE services SET current_used_bytes = ? WHERE id = ?')
      .bind(realServiceBytes, serviceId)
      .run();
  }

  let usersFixed = 0;
  for (const { user_id, used_bytes } of userUsageRows.results ?? []) {
    const realBytes = Number(used_bytes ?? 0);
    const storedBytes = storedUserMap[user_id] ?? 0;
    if (realBytes !== storedBytes) {
      if (!dryRun) {
        await db
          .prepare('UPDATE service_users SET current_used_bytes = ? WHERE service_id = ? AND user_id = ?')
          .bind(realBytes, serviceId, user_id)
          .run();
      }
      usersFixed++;
    }
  }

  const seenUsers = new Set((userUsageRows.results ?? []).map(r => r.user_id));
  for (const [user_id, storedBytes] of Object.entries(storedUserMap)) {
    if (!seenUsers.has(user_id) && storedBytes !== 0) {
      if (!dryRun) {
        await db
          .prepare('UPDATE service_users SET current_used_bytes = ? WHERE service_id = ? AND user_id = ?')
          .bind(0, serviceId, user_id)
          .run();
      }
      usersFixed++;
    }
  }

  return {
    service_drift_bytes: serviceDrift,
    service_corrected: !dryRun && serviceDrift !== 0,
    users_fixed: usersFixed,
    dry_run: dryRun,
  };
}

export interface LogEventInput {
  serviceId: string;
  userId: string;
  action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed' | 'quota_reconciled';
  resourceType: 'file' | 'folder' | 'service';
  resourceId: string;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
  actorId?: string | null;
  targetUserId?: string | null;
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
       (id, service_id, user_id, action, resource_type, resource_id, metadata, ip_address, actor_id, target_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      input.actorId ?? null,
      input.targetUserId ?? null,
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
