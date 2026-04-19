import type { D1Database } from '@cloudflare/workers-types';

export interface FolderRecord {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color_tag: string | null;
  is_trashed: number;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface CreateFolderInput {
  id: string;
  user_id: string;
  parent_id?: string | null;
  name: string;
  color_tag?: string | null;
}

export interface UpdateFolderInput {
  name?: string;
  color_tag?: string | null;
}

export async function createFolder(db: D1Database, input: CreateFolderInput): Promise<FolderRecord> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO folders (id, user_id, parent_id, name, color_tag, is_trashed, trashed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`
    )
    .bind(
      input.id,
      input.user_id,
      input.parent_id ?? null,
      input.name,
      input.color_tag ?? null,
      now,
      now
    )
    .run();

  return getFolder(db, input.id) as Promise<FolderRecord>;
}

export async function getFolder(db: D1Database, id: string): Promise<FolderRecord | null> {
  const result = await db
    .prepare('SELECT * FROM folders WHERE id = ?')
    .bind(id)
    .first<FolderRecord>();
  return result ?? null;
}

export async function getFolderForUser(db: D1Database, id: string, userId: string): Promise<FolderRecord | null> {
  const result = await db
    .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<FolderRecord>();
  return result ?? null;
}

export async function listFolders(
  db: D1Database,
  userId: string,
  parentId?: string | null,
  trashedOnly = false
): Promise<FolderRecord[]> {
  let query: string;
  let binds: (string | number | null)[];

  if (trashedOnly) {
    query = 'SELECT * FROM folders WHERE user_id = ? AND is_trashed = 1 ORDER BY created_at DESC';
    binds = [userId];
  } else if (parentId === null || parentId === undefined) {
    // Root-level folders (no parent)
    query = 'SELECT * FROM folders WHERE user_id = ? AND parent_id IS NULL AND is_trashed = 0 ORDER BY name ASC';
    binds = [userId];
  } else {
    query = 'SELECT * FROM folders WHERE user_id = ? AND parent_id = ? AND is_trashed = 0 ORDER BY name ASC';
    binds = [userId, parentId];
  }

  const result = await db.prepare(query).bind(...binds).all<FolderRecord>();
  return result.results ?? [];
}

export async function updateFolder(
  db: D1Database,
  id: string,
  userId: string,
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

  binds.push(id, userId);

  const result = await db
    .prepare(`UPDATE folders SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ? AND is_trashed = 0`)
    .bind(...binds)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getFolderForUser(db, id, userId);
}

export async function trashFolder(db: D1Database, id: string, userId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      'UPDATE folders SET is_trashed = 1, trashed_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND is_trashed = 0'
    )
    .bind(now, now, id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function restoreFolder(db: D1Database, id: string, userId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      'UPDATE folders SET is_trashed = 0, trashed_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND is_trashed = 1'
    )
    .bind(now, id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteFolderPermanently(db: D1Database, id: string, userId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM folders WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
