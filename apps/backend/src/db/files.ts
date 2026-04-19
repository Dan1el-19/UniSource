import type { D1Database } from '@cloudflare/workers-types';

export type UploadDestination = 'r2' | 'appwrite';
export type UploadStatus = 'pending' | 'completed' | 'failed';

export interface UploadRecord {
  id: string;
  service_id: string;
  user_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  destination: UploadDestination;
  storage_key: string;
  bucket: string;
  status: UploadStatus;
  presigned_url: string | null;
  expires_at: number;
  created_at: number;
  updated_at: number;
}

export interface CreateUploadInput {
  id: string;
  service_id: string;
  user_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  destination: UploadDestination;
  storage_key: string;
  bucket: string;
  presigned_url: string | null;
  expires_at: number;
}

export interface ListUploadsInput {
  limit: number;
  cursor?: string | null;
  destination?: UploadDestination;
  status?: UploadStatus;
}

export interface ListUploadsResult {
  items: UploadRecord[];
  next_cursor: string | null;
}

function decodeUploadCursor(cursor: string): { created_at: number; id: string } | null {
  const separatorIndex = cursor.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex >= cursor.length - 1) {
    return null;
  }

  const createdAtRaw = cursor.slice(0, separatorIndex);
  const id = cursor.slice(separatorIndex + 1);
  const createdAt = Number(createdAtRaw);

  if (!Number.isInteger(createdAt) || createdAt <= 0 || !id) {
    return null;
  }

  return { created_at: createdAt, id };
}

function encodeUploadCursor(record: Pick<UploadRecord, 'created_at' | 'id'>): string {
  return `${record.created_at}:${record.id}`;
}

export async function createUpload(db: D1Database, input: CreateUploadInput): Promise<UploadRecord> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO uploads
         (id, service_id, user_id, filename, size, mime_type, destination,
          storage_key, bucket, status, presigned_url, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
      input.user_id,
      input.filename,
      input.size,
      input.mime_type,
      input.destination,
      input.storage_key,
      input.bucket,
      input.presigned_url,
      input.expires_at,
      now,
      now
    )
    .run();

  return getUpload(db, input.id) as Promise<UploadRecord>;
}

export async function getUpload(db: D1Database, id: string): Promise<UploadRecord | null> {
  const result = await db
    .prepare('SELECT * FROM uploads WHERE id = ?')
    .bind(id)
    .first<UploadRecord>();
  return result ?? null;
}

// Used in /upload/complete to prevent cross-user upload hijacking (bug #15)
export async function getUploadForUser(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<UploadRecord | null> {
  const result = await db
    .prepare('SELECT * FROM uploads WHERE id = ? AND service_id = ? AND (user_id = ? OR user_id IS NULL)')
    .bind(id, serviceId, userId)
    .first<UploadRecord>();
  return result ?? null;
}

export async function completeUpload(db: D1Database, id: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE uploads SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function failUpload(db: D1Database, id: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE uploads SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listUploads(db: D1Database, input: ListUploadsInput): Promise<ListUploadsResult> {
  const binds: Array<string | number> = [];
  const whereClauses: string[] = ['1 = 1'];

  if (input.destination) {
    whereClauses.push('destination = ?');
    binds.push(input.destination);
  }

  if (input.status) {
    whereClauses.push('status = ?');
    binds.push(input.status);
  }

  if (input.cursor) {
    const parsedCursor = decodeUploadCursor(input.cursor);
    if (!parsedCursor) {
      throw new Error('Invalid cursor');
    }

    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(parsedCursor.created_at, parsedCursor.created_at, parsedCursor.id);
  }

  const fetchLimit = input.limit + 1;
  const query = `
    SELECT *
    FROM uploads
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(...binds, fetchLimit).all<UploadRecord>();
  const rows = result.results ?? [];

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    next_cursor: hasMore && lastItem ? encodeUploadCursor(lastItem) : null,
  };
}

export async function deleteUploadRecord(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM uploads WHERE id = ?')
    .bind(id)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
