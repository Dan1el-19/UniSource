import type { D1Database } from '@cloudflare/workers-types';
import type { BulkResult, BulkItemResult } from './fileRecords';
import { partitionBulkResults } from './fileRecords';

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

export interface ListFoldersV2Input {
  user_id: string;
  service_id: string;
  parent_id?: string | null;
  trashed_only?: boolean;
  search?: string;
  sort_by?: 'created_at' | 'name';
  sort_dir?: 'asc' | 'desc';
  limit: number;
  cursor?: string | null;
}

function encodeFolderCursor(record: Pick<FolderRecord, 'created_at' | 'name' | 'id'>, sortBy: 'created_at' | 'name' = 'created_at'): string {
  let val = '';
  if (sortBy === 'name') {
    val = record.name;
  } else {
    val = record.created_at.toString();
  }

  const payload = JSON.stringify({ val, id: record.id });
  return btoa(payload);
}

function decodeFolderCursor(cursor: string, sortBy: 'created_at' | 'name' = 'created_at'): { val: string | number; id: string } | null {
  try {
    const payload = JSON.parse(atob(cursor));
    if (!payload || typeof payload !== 'object' || !payload.id || payload.val === undefined) return null;

    if (sortBy === 'name') {
      return { val: String(payload.val), id: payload.id };
    }

    const valNum = Number(payload.val);
    if (!Number.isInteger(valNum) || valNum <= 0) return null;

    return { val: valNum, id: payload.id };
  } catch {
    // Fallback for v1 legacy cursors (e.g. "1712345678:some-uuid")
    const sep = cursor.indexOf(':');
    if (sep > 0 && sep < cursor.length - 1) {
      const valStr = cursor.slice(0, sep);
      const id = cursor.slice(sep + 1);

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
    const parsed = decodeFolderCursor(input.cursor, 'created_at');
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(parsed.val, parsed.val, parsed.id);
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
    next_cursor: hasMore && lastItem ? encodeFolderCursor(lastItem, 'created_at') : null,
  };
}

export async function listFoldersV2(
  db: D1Database,
  input: ListFoldersV2Input
): Promise<ListFoldersResult> {
  const binds: (string | number | null)[] = [input.user_id, input.service_id];
  const whereClauses: string[] = ['user_id = ?', 'service_id = ?'];

  if (input.trashed_only) {
    whereClauses.push('is_trashed = 1');
  } else {
    whereClauses.push('is_trashed = 0');
    if ('parent_id' in input && input.parent_id !== undefined) {
      if (input.parent_id === null) {
        whereClauses.push('parent_id IS NULL');
      } else {
        whereClauses.push('parent_id = ?');
        binds.push(input.parent_id);
      }
    }
  }

  if (input.search) {
    whereClauses.push('name LIKE ?');
    binds.push(`%${input.search}%`);
  }

  const sortBy = input.sort_by || 'created_at';
  const sortDir = input.sort_dir || 'desc';
  const op = sortDir === 'desc' ? '<' : '>';
  const sortColumn = sortBy === 'name' ? 'name' : 'created_at';

  if (input.cursor) {
    const parsed = decodeFolderCursor(input.cursor, sortBy);
    if (!parsed) throw new Error('Invalid cursor');
    whereClauses.push(`(${sortColumn} ${op} ? OR (${sortColumn} = ? AND id ${op} ?))`);
    binds.push(parsed.val, parsed.val, parsed.id);
  }

  const fetchLimit = input.limit + 1;
  const query = `
    SELECT * FROM folders
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${sortColumn} ${sortDir.toUpperCase()}, id ${sortDir.toUpperCase()}
    LIMIT ?
  `;

  const result = await db.prepare(query).bind(...binds, fetchLimit).all<FolderRecord>();
  const rows = result.results ?? [];

  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  const lastItem = items[items.length - 1] ?? null;

  return {
    items,
    next_cursor: hasMore && lastItem ? encodeFolderCursor(lastItem, sortBy) : null,
  };
}

export async function getFolderBreadcrumbs(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<FolderRecord[]> {
  const result = await db.prepare(`
    WITH RECURSIVE breadcrumbs AS (
      SELECT * FROM folders
      WHERE id = ? AND user_id = ? AND service_id = ?

      UNION ALL

      SELECT f.* FROM folders f
      JOIN breadcrumbs b ON f.id = b.parent_id
      WHERE f.user_id = ? AND f.service_id = ?
    )
    SELECT * FROM breadcrumbs
  `).bind(id, userId, serviceId, userId, serviceId).all<FolderRecord>();

  return (result.results ?? []).reverse();
}

export async function bulkTrashFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] };
  const now = Math.floor(Date.now() / 1000);

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId));
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts);

  const items: BulkItemResult[] = [];
  const toTrash: string[] = [];
  ids.forEach((id, idx) => {
    const row = probeResults[idx].results[0];
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' });
    } else if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'Folder already in trash' });
    } else {
      toTrash.push(id);
    }
  });

  if (toTrash.length > 0) {
    const stmts = toTrash.map(id => db.prepare(
      `UPDATE folders SET is_trashed = 1, trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(now, now, id, userId, serviceId));
    const results = await db.batch(stmts);
    results.forEach((r, idx) => {
      const id = toTrash[idx];
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true });
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' });
    });
  }

  return partitionBulkResults(items);
}

export async function bulkRestoreFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] };
  const now = Math.floor(Date.now() / 1000);

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed, parent_id FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId));
  const probeResults = await db.batch<{ id: string; is_trashed: number; parent_id: string | null }>(probeStmts);

  const items: BulkItemResult[] = [];
  const toRestore: string[] = [];
  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx];
    const row = probeResults[idx].results[0];
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' });
      continue;
    }
    if (row.is_trashed === 0) {
      items.push({ id, ok: false, code: 'conflict', message: 'Folder is not in trash' });
      continue;
    }
    // api-v2-architecture.md §5: restore tylko gdy parent jest aktywny
    if (row.parent_id) {
      const parent = await db.prepare(
        `SELECT is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
      ).bind(row.parent_id, userId, serviceId).first<{ is_trashed: number }>();
      if (!parent || parent.is_trashed === 1) {
        items.push({ id, ok: false, code: 'conflict', message: 'Parent folder is trashed or missing' });
        continue;
      }
    }
    toRestore.push(id);
  }

  if (toRestore.length > 0) {
    const stmts = toRestore.map(id => db.prepare(
      `UPDATE folders SET is_trashed = 0, trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
    ).bind(now, id, userId, serviceId));
    const results = await db.batch(stmts);
    results.forEach((r, idx) => {
      const id = toRestore[idx];
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true });
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' });
    });
  }

  return partitionBulkResults(items);
}

export async function bulkMoveFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string,
  newParentId: string | null
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] };
  const now = Math.floor(Date.now() / 1000);

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId));
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts);

  const items: BulkItemResult[] = [];
  const toMove: string[] = [];

  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx];
    const row = probeResults[idx].results[0];

    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' });
      continue;
    }
    if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'Cannot move a trashed folder' });
      continue;
    }
    if (newParentId === id) {
      items.push({ id, ok: false, code: 'conflict', message: 'Cannot move folder into itself' });
      continue;
    }
    if (newParentId !== null) {
      // Cycle check: target parent must NOT be a descendant of `id`.
      const descendants = await getDescendantFolderIds(db, id, userId, serviceId);
      const descendantsExcludingSelf = descendants.filter(d => d !== id);
      if (descendantsExcludingSelf.includes(newParentId)) {
        items.push({ id, ok: false, code: 'conflict', message: 'Cycle detected: target parent is a descendant of this folder' });
        continue;
      }
    }
    toMove.push(id);
  }

  if (toMove.length > 0) {
    const stmts = toMove.map(id => db.prepare(
      `UPDATE folders SET parent_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(newParentId, now, id, userId, serviceId));
    const results = await db.batch(stmts);
    results.forEach((r, idx) => {
      const id = toMove[idx];
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true });
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' });
    });
  }

  return partitionBulkResults(items);
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
