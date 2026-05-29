import type { D1Database } from '@cloudflare/workers-types';
import { encodeCursor, decodeCursor } from '../lib/v2/cursor';
import { V2Error } from '../lib/v2/errors';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_PERMISSIONS = [
  'upload',
  'files:read',
  'files:delete',
  'shares',
  'releases',
  'main_storage',
  'admin',
] as const;

export type Permission = (typeof VALID_PERMISSIONS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string;
  service_id: string;
  name: string;
  key_prefix: string;
  permissions: Permission[];
  cors_origins: string[] | null;
  is_account_level: boolean;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

export interface ApiKeyCreateResult extends ApiKeyRecord {
  /** Plaintext key — returned ONCE, never stored. */
  plaintext_key: string;
}

export interface CursorPage<T> {
  items: T[];
  page: { limit: number; next_cursor: string | null };
}

export interface ApiKeyPageInput {
  limit: number;
  cursor?: string;
  cursorSecret: string;
}

interface ApiKeyRow {
  id: string;
  service_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  permissions: string;
  cors_origins: string | null;
  is_account_level: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  created_at: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapRow(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    service_id: row.service_id,
    name: row.name,
    key_prefix: row.key_prefix,
    permissions: JSON.parse(row.permissions) as Permission[],
    cors_origins: row.cors_origins ? (JSON.parse(row.cors_origins) as string[]) : null,
    is_account_level: row.is_account_level === 1,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

export async function hashApiKey(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function validatePermissions(perms: string[]): perms is Permission[] {
  return perms.every((p) => (VALID_PERMISSIONS as readonly string[]).includes(p));
}

// ─── Service-level API keys ───────────────────────────────────────────────────

export async function createServiceApiKey(
  db: D1Database,
  serviceId: string,
  name: string,
  permissions: Permission[],
  corsOrigins?: string[],
  expiresAt?: number
): Promise<ApiKeyCreateResult> {
  const id = generateId();
  const secret = generateSecret();
  const plaintext_key = `usc_${serviceId}_${secret}`;
  const key_hash = await sha256Hex(plaintext_key);
  const key_prefix = plaintext_key.slice(0, 16);
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO api_keys (id, service_id, name, key_prefix, key_hash, permissions, cors_origins, is_account_level, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(
      id,
      serviceId,
      name,
      key_prefix,
      key_hash,
      JSON.stringify(permissions),
      corsOrigins ? JSON.stringify(corsOrigins) : null,
      expiresAt ?? null,
      now
    )
    .run();

  return {
    id,
    service_id: serviceId,
    name,
    key_prefix,
    permissions,
    cors_origins: corsOrigins ?? null,
    is_account_level: false,
    expires_at: expiresAt ?? null,
    revoked_at: null,
    last_used_at: null,
    created_at: now,
    plaintext_key,
  };
}

export async function listServiceApiKeys(db: D1Database, serviceId: string): Promise<ApiKeyRecord[]> {
  const { results } = await db
    .prepare(`SELECT * FROM api_keys WHERE service_id = ? AND is_account_level = 0 ORDER BY created_at DESC`)
    .bind(serviceId)
    .all<ApiKeyRow>();
  return results.map(mapRow);
}

async function decodeApiKeyCursor(secret: string, cursor: string | undefined, fingerprint: string) {
  if (!cursor) return null;
  try {
    return await decodeCursor(secret, cursor, { sb: 'created_at', sd: 'desc', fp: fingerprint });
  } catch {
    throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
  }
}

export async function listServiceApiKeysPage(
  db: D1Database,
  serviceId: string,
  input: ApiKeyPageInput
): Promise<CursorPage<ApiKeyRecord>> {
  const fingerprint = `service:${serviceId}`;
  const cursor = await decodeApiKeyCursor(input.cursorSecret, input.cursor, fingerprint);
  const where = ['service_id = ?', 'is_account_level = 0'];
  const binds: unknown[] = [serviceId];

  if (cursor) {
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(cursor.lv, cursor.lv, cursor.li);
  }

  const { results } = await db
    .prepare(`SELECT * FROM api_keys WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...binds, input.limit + 1)
    .all<ApiKeyRow>();

  const rows = results ?? [];
  const pageRows = rows.slice(0, input.limit);
  const last = pageRows[pageRows.length - 1];
  const next_cursor = rows.length > input.limit && last
    ? await encodeCursor(input.cursorSecret, { v: 1, sb: 'created_at', sd: 'desc', lv: last.created_at, li: last.id, fp: fingerprint })
    : null;

  return { items: pageRows.map(mapRow), page: { limit: input.limit, next_cursor } };
}

export async function updateApiKey(
  db: D1Database,
  keyId: string,
  serviceId: string,
  patch: { name?: string; permissions?: Permission[] }
): Promise<ApiKeyRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.name !== undefined) {
    sets.push('name = ?');
    vals.push(patch.name);
  }
  if (patch.permissions !== undefined) {
    sets.push('permissions = ?');
    vals.push(JSON.stringify(patch.permissions));
  }

  if (sets.length === 0) return getApiKeyById(db, keyId, serviceId);

  vals.push(keyId, serviceId);
  await db
    .prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ? AND service_id = ? AND revoked_at IS NULL`)
    .bind(...vals)
    .run();

  return getApiKeyById(db, keyId, serviceId);
}

export async function revokeApiKey(db: D1Database, keyId: string, serviceId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND service_id = ? AND revoked_at IS NULL`)
    .bind(now, keyId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function rotateApiKey(
  db: D1Database,
  keyId: string,
  serviceId: string
): Promise<ApiKeyCreateResult | null> {
  const existing = await getApiKeyById(db, keyId, serviceId);
  if (!existing || existing.revoked_at !== null) return null;

  const now = Math.floor(Date.now() / 1000);

  // Revoke old key
  await db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND service_id = ?`)
    .bind(now, keyId, serviceId)
    .run();

  // Create new key with same settings
  return createServiceApiKey(
    db,
    serviceId,
    existing.name,
    existing.permissions,
    existing.cors_origins ?? undefined,
    existing.expires_at ?? undefined
  );
}

export async function getApiKeyById(
  db: D1Database,
  keyId: string,
  serviceId: string
): Promise<ApiKeyRecord | null> {
  const row = await db
    .prepare(`SELECT * FROM api_keys WHERE id = ? AND service_id = ?`)
    .bind(keyId, serviceId)
    .first<ApiKeyRow>();
  return row ? mapRow(row) : null;
}

// ─── Account-level API keys ───────────────────────────────────────────────────

export async function createAccountApiKey(
  db: D1Database,
  name: string,
  permissions: Permission[],
  serviceIds: string[],
  expiresAt?: number
): Promise<ApiKeyCreateResult> {
  const id = generateId();
  const secret = generateSecret();
  const plaintext_key = `usc_account_${secret}`;
  const key_hash = await sha256Hex(plaintext_key);
  const key_prefix = plaintext_key.slice(0, 16);
  const now = Math.floor(Date.now() / 1000);

  // Use first serviceId as the anchor service_id (required FK), but mark as account-level
  const anchorServiceId = serviceIds[0] ?? 'default';

  await db
    .prepare(
      `INSERT INTO api_keys (id, service_id, name, key_prefix, key_hash, permissions, is_account_level, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(id, anchorServiceId, name, key_prefix, key_hash, JSON.stringify(permissions), expiresAt ?? null, now)
    .run();

  // Insert allowed services
  const stmts = serviceIds.map((sid) =>
    db.prepare(`INSERT OR IGNORE INTO account_key_services (key_id, service_id) VALUES (?, ?)`).bind(id, sid)
  );
  if (stmts.length > 0) await db.batch(stmts);

  return {
    id,
    service_id: anchorServiceId,
    name,
    key_prefix,
    permissions,
    cors_origins: null,
    is_account_level: true,
    expires_at: expiresAt ?? null,
    revoked_at: null,
    last_used_at: null,
    created_at: now,
    plaintext_key,
  };
}

export async function listAccountApiKeys(db: D1Database): Promise<(ApiKeyRecord & { service_ids: string[] })[]> {
  const { results } = await db
    .prepare(`SELECT * FROM api_keys WHERE is_account_level = 1 ORDER BY created_at DESC`)
    .all<ApiKeyRow>();

  if (results.length === 0) return [];

  const ids = results.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: svcRows } = await db
    .prepare(`SELECT key_id, service_id FROM account_key_services WHERE key_id IN (${placeholders})`)
    .bind(...ids)
    .all<{ key_id: string; service_id: string }>();

  const svcMap = new Map<string, string[]>();
  for (const row of svcRows) {
    const arr = svcMap.get(row.key_id) ?? [];
    arr.push(row.service_id);
    svcMap.set(row.key_id, arr);
  }

  return results.map((r) => ({ ...mapRow(r), service_ids: svcMap.get(r.id) ?? [] }));
}

export async function listAccountApiKeysPage(
  db: D1Database,
  input: ApiKeyPageInput
): Promise<CursorPage<ApiKeyRecord & { service_ids: string[] }>> {
  const fingerprint = 'account-keys';
  const cursor = await decodeApiKeyCursor(input.cursorSecret, input.cursor, fingerprint);
  const where = ['is_account_level = 1'];
  const binds: unknown[] = [];

  if (cursor) {
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(cursor.lv, cursor.lv, cursor.li);
  }

  const { results } = await db
    .prepare(`SELECT * FROM api_keys WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...binds, input.limit + 1)
    .all<ApiKeyRow>();

  const rows = results ?? [];
  const pageRows = rows.slice(0, input.limit);
  const ids = pageRows.map((row) => row.id);
  const svcMap = new Map<string, string[]>();

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const { results: svcRows } = await db
      .prepare(`SELECT key_id, service_id FROM account_key_services WHERE key_id IN (${placeholders})`)
      .bind(...ids)
      .all<{ key_id: string; service_id: string }>();

    for (const row of svcRows ?? []) {
      const arr = svcMap.get(row.key_id) ?? [];
      arr.push(row.service_id);
      svcMap.set(row.key_id, arr);
    }
  }

  const last = pageRows[pageRows.length - 1];
  const next_cursor = rows.length > input.limit && last
    ? await encodeCursor(input.cursorSecret, { v: 1, sb: 'created_at', sd: 'desc', lv: last.created_at, li: last.id, fp: fingerprint })
    : null;

  return {
    items: pageRows.map((row) => ({ ...mapRow(row), service_ids: svcMap.get(row.id) ?? [] })),
    page: { limit: input.limit, next_cursor },
  };
}

export async function updateAccountApiKey(
  db: D1Database,
  keyId: string,
  patch: { name?: string; permissions?: Permission[]; service_ids?: string[] }
): Promise<(ApiKeyRecord & { service_ids: string[] }) | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.name !== undefined) {
    sets.push('name = ?');
    vals.push(patch.name);
  }
  if (patch.permissions !== undefined) {
    sets.push('permissions = ?');
    vals.push(JSON.stringify(patch.permissions));
  }

  if (sets.length > 0) {
    vals.push(keyId);
    await db
      .prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ? AND is_account_level = 1 AND revoked_at IS NULL`)
      .bind(...vals)
      .run();
  }

  if (patch.service_ids !== undefined) {
    await db.prepare(`DELETE FROM account_key_services WHERE key_id = ?`).bind(keyId).run();
    const stmts = patch.service_ids.map((sid) =>
      db.prepare(`INSERT OR IGNORE INTO account_key_services (key_id, service_id) VALUES (?, ?)`).bind(keyId, sid)
    );
    if (stmts.length > 0) await db.batch(stmts);
  }

  const row = await db
    .prepare(`SELECT * FROM api_keys WHERE id = ? AND is_account_level = 1`)
    .bind(keyId)
    .first<ApiKeyRow>();
  if (!row) return null;

  const { results: svcRows } = await db
    .prepare(`SELECT service_id FROM account_key_services WHERE key_id = ?`)
    .bind(keyId)
    .all<{ service_id: string }>();

  return { ...mapRow(row), service_ids: svcRows.map((r) => r.service_id) };
}

export async function revokeAccountApiKey(db: D1Database, keyId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND is_account_level = 1 AND revoked_at IS NULL`)
    .bind(now, keyId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ─── Validation (used by auth middleware) ─────────────────────────────────────

export interface ValidatedApiKey {
  id: string;
  service_id: string;
  permissions: Permission[];
  is_account_level: boolean;
  allowed_service_ids: string[];
}

/**
 * Validate an incoming API key by SHA-256 hash.
 * Returns null if not found, revoked, or expired.
 * Updates last_used_at on success.
 */
export async function validateApiKeyByHash(
  db: D1Database,
  plaintext: string,
  requestedServiceId: string
): Promise<ValidatedApiKey | null> {
  const hash = await sha256Hex(plaintext);

  const row = await db
    .prepare(
      `SELECT id, service_id, permissions, is_account_level, expires_at, revoked_at
       FROM api_keys WHERE key_hash = ?`
    )
    .bind(hash)
    .first<{
      id: string;
      service_id: string;
      permissions: string;
      is_account_level: number;
      expires_at: number | null;
      revoked_at: number | null;
    }>();

  if (!row) return null;
  if (row.revoked_at !== null) return null;

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at !== null && row.expires_at < now) return null;

  const isAccountLevel = row.is_account_level === 1;
  let allowedServiceIds: string[] = [];

  if (isAccountLevel) {
    const { results } = await db
      .prepare(`SELECT service_id FROM account_key_services WHERE key_id = ?`)
      .bind(row.id)
      .all<{ service_id: string }>();
    allowedServiceIds = results.map((r) => r.service_id);

    if (!allowedServiceIds.includes(requestedServiceId)) return null;
  } else {
    if (row.service_id !== requestedServiceId) return null;
    allowedServiceIds = [row.service_id];
  }

  // Update last_used_at (fire-and-forget, don't await to avoid latency)
  db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).bind(now, row.id).run();

  return {
    id: row.id,
    service_id: row.service_id,
    permissions: JSON.parse(row.permissions) as Permission[],
    is_account_level: isAccountLevel,
    allowed_service_ids: allowedServiceIds,
  };
}

// ─── CORS helpers ─────────────────────────────────────────────────────────────

export async function getServiceCors(db: D1Database, serviceId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT origin FROM service_cors WHERE service_id = ? ORDER BY origin`)
    .bind(serviceId)
    .all<{ origin: string }>();
  return results.map((r) => r.origin);
}

export async function replaceServiceCors(db: D1Database, serviceId: string, origins: string[]): Promise<void> {
  const stmts = [db.prepare(`DELETE FROM service_cors WHERE service_id = ?`).bind(serviceId)];
  for (const origin of origins) {
    stmts.push(
      db
        .prepare(`INSERT OR IGNORE INTO service_cors (service_id, origin, created_at) VALUES (?, ?, ?)`)
        .bind(serviceId, origin, Math.floor(Date.now() / 1000))
    );
  }
  await db.batch(stmts);
}
