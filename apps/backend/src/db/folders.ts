import type { D1Database } from '@cloudflare/workers-types';

export interface FolderRecord {
  id: string;
  service_id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color_tag: string | null;
  is_trashed: 0 | 1;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFolderInput {
  id: string;
  service_id: string;
  user_id: string;
  parent_id?: string | null;
  name: string;
  color_tag?: string | null;
}

export interface UpdateFolderInput {
  name?: string;
  color_tag?: string | null;
}

export interface ListFoldersInput {
  user_id: string;
  service_id: string;
  parent_id?: string | null;
  trashed_only?: boolean;
  limit: number;
  cursor?: string | null;
}

export interface ListFoldersResult {
  items: FolderRecord[];
  next_cursor: string | null;
}

function encodeFolderCursor(record: Pick<FolderRecord, 'created_at' | 'id'>): string {
  return `${record.created_at}:${record.id}`;
}

function decodeFolderCursor(cursor: string): { created_at: number; id: string } | null {
  const sep = cursor.indexOf(':');
  if (sep <= 0 || sep >= cursor.length - 1) return null;
  const created_at = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!Number.isInteger(created_at) || created_at <= 0 || !id) return null;
  return { created_at, id };
}

export async function createFolder(db: D1Database, input: CreateFolderInput): Promise<FolderRecord> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO folders
         (id, service_id, user_id, parent_id, name, color_tag, is_trashed, trashed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
      input.user_id,
      input.parent_id ?? null,
      input.name,
      input.color_tag ?? null,
      now,
      now
    )
    .run();

  return getFolderForUser(db, input.id, input.user_id, input.service_id) as Promise<FolderRecord>;
}

export async function getFolder(db: D1Database, id: string): Promise<FolderRecord | null> {
  const result = await db
    .prepare('SELECT * FROM folders WHERE id = ?')
    .bind(id)
    .first<FolderRecord>();
  return result ?? null;
}

export async function getFolderForUser(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<FolderRecord | null> {
  const result = await db
    .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .first<FolderRecord>();
  return result ?? null;
}

export async function listFolders(db: D1Database, input: ListFoldersInput): Promise<ListFoldersResult> {
  const binds: (string | number | null)[] = [input.user_id, input.service_id];
  const whereClauses: string[] = ['user_id = ?', 'service_id = ?'];

  if (input.trashed_only) {
    whereClauses.push('is_trashed = 1');
  } else {
    whereClauses.push('is_trashed = 0');

    if (input.parent_id === null || input.parent_id === undefined) {
      whereClauses.push('parent_id IS NULL');
    } else {
      whereClauses.push('parent_id = ?');
      binds.push(input.parent_id);
    }
  }

  if (input.cursor) {
    const parsed = decodeFolderCursor(input.cursor);
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(parsed.created_at, parsed.created_at, parsed.id);
  }

  const fetchLimit = input.limit + 1;
  const query = `
    SELECT * FROM folders
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(...binds, fetchLimit).all<FolderRecord>();
  const rows = result.results ?? [];

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    next_cursor: hasMore && lastItem ? encodeFolderCursor(lastItem) : null,
  };
}

export async function updateFolder(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string,
  patch: UpdateFolderInput
): Promise<FolderRecord | null> {
  const now = Math.floor(Date.now() / 1000);
  const setClauses: string[] = ['updated_at = ?'];
  const binds: (string | number | null)[] = [now];

  if (patch.name !== undefined) {
    setClauses.push('name = ?');
    binds.push(patch.name);
  }

  if ('color_tag' in patch) {
    setClauses.push('color_tag = ?');
    binds.push(patch.color_tag ?? null);
  }

  binds.push(id, userId, serviceId);

  const result = await db
    .prepare(
      `UPDATE folders SET ${setClauses.join(', ')}
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    )
    .bind(...binds)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getFolderForUser(db, id, userId, serviceId);
}

export async function trashFolder(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE folders
       SET is_trashed = 1, trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    )
    .bind(now, now, id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function restoreFolder(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE folders
       SET is_trashed = 0, trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
    )
    .bind(now, id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// Get all descendant folder IDs (including the folder itself) using recursive CTE.
// Used for cascading soft-delete — safe in D1 (SQLite 3.35+ supports recursive CTEs).
export async function getDescendantFolderIds(
  db: D1Database,
  rootId: string,
  userId: string,
  serviceId: string
): Promise<string[]> {
  const result = await db
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM folders
           WHERE id = ? AND user_id = ? AND service_id = ?
         UNION ALL
         SELECT f.id FROM folders f
           JOIN subtree s ON f.parent_id = s.id
           WHERE f.user_id = ? AND f.service_id = ?
       )
       SELECT id FROM subtree`
    )
    .bind(rootId, userId, serviceId, userId, serviceId)
    .all<{ id: string }>();

  return (result.results ?? []).map((r) => r.id);
}

// Permanently delete a folder. The caller must handle cascading file soft-deletes first.
export async function deleteFolderPermanently(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM folders WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
