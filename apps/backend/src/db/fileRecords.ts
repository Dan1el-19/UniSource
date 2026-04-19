import type { D1Database } from '@cloudflare/workers-types';
import type { UploadDestination } from './files';

export interface FileRecord {
  id: string;
  user_id: string;
  folder_id: string | null;
  upload_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  storage_destination: UploadDestination;
  storage_key: string;
  bucket: string;
  is_trashed: number;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFileRecordInput {
  id: string;
  user_id: string;
  folder_id?: string | null;
  upload_id?: string | null;
  filename: string;
  size: number;
  mime_type: string;
  storage_destination: UploadDestination;
  storage_key: string;
  bucket: string;
}

export interface ListFileRecordsInput {
  user_id: string;
  folder_id?: string | null;
  trashed_only?: boolean;
  limit: number;
  cursor?: string | null;
}

export interface ListFileRecordsResult {
  items: FileRecord[];
  next_cursor: string | null;
}

function encodeFileCursor(record: Pick<FileRecord, 'created_at' | 'id'>): string {
  return `${record.created_at}:${record.id}`;
}

function decodeFileCursor(cursor: string): { created_at: number; id: string } | null {
  const separatorIndex = cursor.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex >= cursor.length - 1) return null;

  const createdAt = Number(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + 1);

  if (!Number.isInteger(createdAt) || createdAt <= 0 || !id) return null;
  return { created_at: createdAt, id };
}

export async function createFileRecord(db: D1Database, input: CreateFileRecordInput): Promise<FileRecord> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO files (id, user_id, folder_id, upload_id, filename, size, mime_type,
        storage_destination, storage_key, bucket, is_trashed, trashed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    )
    .bind(
      input.id,
      input.user_id,
      input.folder_id ?? null,
      input.upload_id ?? null,
      input.filename,
      input.size,
      input.mime_type,
      input.storage_destination,
      input.storage_key,
      input.bucket,
      now,
      now
    )
    .run();

  return getFileRecord(db, input.id) as Promise<FileRecord>;
}

export async function getFileRecord(db: D1Database, id: string): Promise<FileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM files WHERE id = ?')
    .bind(id)
    .first<FileRecord>();
  return result ?? null;
}

export async function getFileRecordForUser(db: D1Database, id: string, userId: string): Promise<FileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<FileRecord>();
  return result ?? null;
}

export async function listFileRecords(db: D1Database, input: ListFileRecordsInput): Promise<ListFileRecordsResult> {
  const binds: (string | number | null)[] = [input.user_id];
  const whereClauses: string[] = ['user_id = ?'];

  if (input.trashed_only) {
    whereClauses.push('is_trashed = 1');
  } else {
    whereClauses.push('is_trashed = 0');

    if ('folder_id' in input) {
      if (input.folder_id === null || input.folder_id === undefined) {
        whereClauses.push('folder_id IS NULL');
      } else {
        whereClauses.push('folder_id = ?');
        binds.push(input.folder_id);
      }
    }
  }

  if (input.cursor) {
    const parsed = decodeFileCursor(input.cursor);
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(parsed.created_at, parsed.created_at, parsed.id);
  }

  const fetchLimit = input.limit + 1;
  const query = `
    SELECT * FROM files
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(...binds, fetchLimit).all<FileRecord>();
  const rows = result.results ?? [];

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    next_cursor: hasMore && lastItem ? encodeFileCursor(lastItem) : null,
  };
}

export async function trashFileRecord(db: D1Database, id: string, userId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      'UPDATE files SET is_trashed = 1, trashed_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND is_trashed = 0'
    )
    .bind(now, now, id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function restoreFileRecord(db: D1Database, id: string, userId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      'UPDATE files SET is_trashed = 0, trashed_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND is_trashed = 1'
    )
    .bind(now, id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function moveFileRecord(
  db: D1Database,
  id: string,
  userId: string,
  newFolderId: string | null
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      'UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ? AND user_id = ? AND is_trashed = 0'
    )
    .bind(newFolderId, now, id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteFileRecordPermanently(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM files WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
