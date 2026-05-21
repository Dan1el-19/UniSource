import type { D1Database } from '@cloudflare/workers-types';
import type { UploadDestination } from './files';

export interface FileRecord {
  id: string;
  service_id: string;
  user_id: string;
  folder_id: string | null;
  upload_id: string | null;
  filename: string;
  size: number;
  mime_type: string;
  storage_destination: UploadDestination;
  storage_key: string;
  bucket: string;
  is_main_storage: 0 | 1;
  is_trashed: 0 | 1;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFileRecordInput {
  id: string;
  service_id: string;
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
  service_id: string;
  folder_id?: string | null;
  trashed_only?: boolean;
  limit: number;
  cursor?: string | null;
}

export interface ListFileRecordsResult {
  items: FileRecord[];
  next_cursor: string | null;
}

export interface ListFileRecordsV2Input {
  user_id: string;
  service_id: string;
  folder_id?: string | null;
  trashed_only?: boolean;
  search?: string;
  mime_type?: string;
  sort_by?: 'created_at' | 'name' | 'size';
  sort_dir?: 'asc' | 'desc';
  limit: number;
  cursor?: string | null;
}

function encodeFileCursor(record: Pick<FileRecord, 'created_at' | 'filename' | 'size' | 'id'>, sortBy: 'created_at' | 'name' | 'size' = 'created_at'): string {
  let val = '';
  if (sortBy === 'name') {
    val = record.filename;
  } else if (sortBy === 'size') {
    val = record.size.toString();
  } else {
    val = record.created_at.toString();
  }

  const payload = JSON.stringify({ val, id: record.id });
  return btoa(payload);
}

function decodeFileCursor(cursor: string, sortBy: 'created_at' | 'name' | 'size' = 'created_at'): { val: string | number; id: string } | null {
  try {
    const payload = JSON.parse(atob(cursor));
    if (!payload || typeof payload !== 'object' || !payload.id || payload.val === undefined) return null;

    if (sortBy === 'name') {
      return { val: String(payload.val), id: payload.id };
    }

    const valNum = Number(payload.val);
    if (!Number.isInteger(valNum) || valNum < 0) return null;

    return { val: valNum, id: payload.id };
  } catch {
    // Fallback for v1 legacy cursors (e.g. "1712345678:some-uuid")
    const separatorIndex = cursor.indexOf(':');
    if (separatorIndex > 0 && separatorIndex < cursor.length - 1) {
      const valStr = cursor.slice(0, separatorIndex);
      const id = cursor.slice(separatorIndex + 1);

      if (sortBy === 'name') {
        return { val: valStr, id };
      }
      const valNum = Number(valStr);
      if (Number.isInteger(valNum) && valNum > 0) {
        return { val: valNum, id };
      }
    }
    return null;
  }
}

export async function createFileRecord(db: D1Database, input: CreateFileRecordInput): Promise<FileRecord> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO files
         (id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
          storage_destination, storage_key, bucket, is_trashed, trashed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
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

export async function getFileRecordForUser(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<FileRecord | null> {
  const result = await db
    .prepare('SELECT * FROM files WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .first<FileRecord>();
  return result ?? null;
}

export async function listFileRecords(
  db: D1Database,
  input: ListFileRecordsInput
): Promise<ListFileRecordsResult> {
  const binds: (string | number | null)[] = [input.user_id, input.service_id];
  const whereClauses: string[] = ['user_id = ?', 'service_id = ?', 'is_main_storage = 0'];

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
    const parsed = decodeFileCursor(input.cursor, 'created_at');
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(parsed.val, parsed.val, parsed.id);
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
    next_cursor: hasMore && lastItem ? encodeFileCursor(lastItem, 'created_at') : null,
  };
}

export async function listFileRecordsV2(
  db: D1Database,
  input: ListFileRecordsV2Input
): Promise<ListFileRecordsResult> {
  const binds: (string | number | null)[] = [input.user_id, input.service_id];
  const whereClauses: string[] = ['user_id = ?', 'service_id = ?'];

  if (input.trashed_only) {
    whereClauses.push('is_trashed = 1');
  } else {
    whereClauses.push('is_trashed = 0');
    if ('folder_id' in input && input.folder_id !== undefined) {
      if (input.folder_id === null) {
        whereClauses.push('folder_id IS NULL');
      } else {
        whereClauses.push('folder_id = ?');
        binds.push(input.folder_id);
      }
    }
  }

  if (input.search) {
    whereClauses.push('filename LIKE ?');
    binds.push(`%${input.search}%`);
  }

  if (input.mime_type) {
    whereClauses.push('mime_type = ?');
    binds.push(input.mime_type);
  }

  const sortBy = input.sort_by || 'created_at';
  const sortDir = input.sort_dir || 'desc';
  const op = sortDir === 'desc' ? '<' : '>';
  let sortColumn = 'created_at';

  if (sortBy === 'name') sortColumn = 'filename';
  else if (sortBy === 'size') sortColumn = 'size';

  if (input.cursor) {
    const parsed = decodeFileCursor(input.cursor, sortBy);
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push(`(${sortColumn} ${op} ? OR (${sortColumn} = ? AND id ${op} ?))`);
    binds.push(parsed.val, parsed.val, parsed.id);
  }

  const fetchLimit = input.limit + 1;
  const query = `
    SELECT * FROM files
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${sortColumn} ${sortDir.toUpperCase()}, id ${sortDir.toUpperCase()}
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(...binds, fetchLimit).all<FileRecord>();
  const rows = result.results ?? [];

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    next_cursor: hasMore && lastItem ? encodeFileCursor(lastItem, sortBy) : null,
  };
}

export async function bulkTrashFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<string[]> {
  if (ids.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);

  const stmts = ids.map(id => db.prepare(
    `UPDATE files
     SET is_trashed = 1, trashed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
  ).bind(now, now, id, userId, serviceId));

  const results = await db.batch(stmts);
  const successIds: string[] = [];
  results.forEach((r, idx) => {
    if ((r.meta.changes ?? 0) > 0) successIds.push(ids[idx]);
  });
  return successIds;
}

export async function bulkRestoreFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<string[]> {
  if (ids.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);

  const stmts = ids.map(id => db.prepare(
    `UPDATE files
     SET is_trashed = 0, trashed_at = NULL, updated_at = ?
     WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
  ).bind(now, id, userId, serviceId));

  const results = await db.batch(stmts);
  const successIds: string[] = [];
  results.forEach((r, idx) => {
    if ((r.meta.changes ?? 0) > 0) successIds.push(ids[idx]);
  });
  return successIds;
}

export async function bulkMoveFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string,
  newFolderId: string | null
): Promise<string[]> {
  if (ids.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);

  const stmts = ids.map(id => db.prepare(
    `UPDATE files
     SET folder_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
  ).bind(newFolderId, now, id, userId, serviceId));

  const results = await db.batch(stmts);
  const successIds: string[] = [];
  results.forEach((r, idx) => {
    if ((r.meta.changes ?? 0) > 0) successIds.push(ids[idx]);
  });
  return successIds;
}

export async function trashFileRecord(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE files
       SET is_trashed = 1, trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    )
    .bind(now, now, id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function restoreFileRecord(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE files
       SET is_trashed = 0, trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
    )
    .bind(now, id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function moveFileRecord(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string,
  newFolderId: string | null
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE files
       SET folder_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    )
    .bind(newFolderId, now, id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function updateFileRecord(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string,
  updates: { filename: string }
): Promise<FileRecord | null> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE files
       SET filename = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ?`
    )
    .bind(updates.filename, now, id, userId, serviceId)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getFileRecord(db, id);
}

export async function deleteFileRecordPermanently(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM files WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// Soft-delete all files belonging to a set of folder IDs (for cascading folder delete)
// Does NOT delete from R2/Appwrite — cron handles physical cleanup after retention period
export async function trashFilesInFolders(
  db: D1Database,
  folderIds: string[],
  userId: string,
  serviceId: string
): Promise<number> {
  if (folderIds.length === 0) return 0;
  const now = Math.floor(Date.now() / 1000);

  const stmts = folderIds.map((folderId) =>
    db
      .prepare(
        `UPDATE files
         SET is_trashed = 1, trashed_at = ?, updated_at = ?
         WHERE folder_id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
      )
      .bind(now, now, folderId, userId, serviceId)
  );

  const results = await db.batch(stmts);
  return results.reduce((acc, r) => acc + (r.meta.changes ?? 0), 0);
}

export interface ListMainStorageInput {
  limit: number;
  cursor?: string | null;
}

export async function createMainStorageFileRecord(
  db: D1Database,
  input: {
    id?: string;
    service_id: string;
    uploaded_by: string;
    upload_id?: string | null;
    filename: string;
    size: number;
    mime_type: string;
    storage_destination: string;
    storage_key: string;
    bucket: string;
  }
): Promise<FileRecord> {
  const now = Math.floor(Date.now() / 1000);
  const id = input.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO files
         (id, service_id, user_id, folder_id, upload_id, filename, size, mime_type,
          storage_destination, storage_key, bucket, is_main_storage, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      input.service_id,
      input.uploaded_by,
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

  return getFileRecord(db, id) as Promise<FileRecord>;
}

export async function listMainStorageFileRecords(
  db: D1Database,
  serviceId: string,
  input: ListMainStorageInput
): Promise<{ items: FileRecord[]; next_cursor: string | null }> {
  const binds: (string | number)[] = [serviceId];
  let cursorClause = '';

  if (input.cursor) {
    const parsed = decodeFileCursor(input.cursor, 'created_at');
    if (!parsed) throw new Error('Invalid cursor');
    cursorClause = 'AND (created_at < ? OR (created_at = ? AND id < ?))';
    binds.push(parsed.val, parsed.val, parsed.id);
  }

  const fetchLimit = input.limit + 1;
  const rows = await db
    .prepare(
      `SELECT * FROM files
       WHERE service_id = ? AND is_main_storage = 1 AND is_trashed = 0
       ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(...binds, fetchLimit)
    .all<FileRecord>();

  const items = rows.results ?? [];
  const hasMore = items.length > input.limit;
  const page = hasMore ? items.slice(0, input.limit) : items;
  const last = page[page.length - 1];
  return {
    items: page,
    next_cursor: hasMore && last ? encodeFileCursor(last, 'created_at') : null,
  };
}
