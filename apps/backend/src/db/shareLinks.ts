import type { D1Database } from '@cloudflare/workers-types';

export interface ShareLink {
  id: string;
  service_id: string;
  file_id: string;
  user_id: string;
  slug: string;
  name: string | null;
  password_hash: string | null;
  expires_at: number | null;
  download_count: number;
  max_downloads: number | null;
  is_active: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface CreateShareLinkInput {
  id: string;
  service_id: string;
  file_id: string;
  user_id: string;
  slug: string;
  name?: string | null;
  password_hash?: string | null;
  expires_at?: number | null;
  max_downloads?: number | null;
}

export interface UpdateShareLinkInput {
  name?: string | null;
  is_active?: 0 | 1;
  password_hash?: string | null;
  expires_at?: number | null;
  max_downloads?: number | null;
}

export async function createShareLink(
  db: D1Database,
  input: CreateShareLinkInput
): Promise<ShareLink> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO share_links
         (id, service_id, file_id, user_id, slug, name, password_hash, expires_at,
          download_count, max_downloads, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
      input.file_id,
      input.user_id,
      input.slug,
      input.name ?? null,
      input.password_hash ?? null,
      input.expires_at ?? null,
      input.max_downloads ?? null,
      now,
      now
    )
    .run();
  return getShareLinkById(db, input.id) as Promise<ShareLink>;
}

export async function getShareLinkById(
  db: D1Database,
  id: string
): Promise<ShareLink | null> {
  const result = await db
    .prepare('SELECT * FROM share_links WHERE id = ?')
    .bind(id)
    .first<ShareLink>();
  return result ?? null;
}

export async function getShareLinkBySlug(
  db: D1Database,
  slug: string
): Promise<ShareLink | null> {
  const result = await db
    .prepare('SELECT * FROM share_links WHERE slug = ?')
    .bind(slug)
    .first<ShareLink>();
  return result ?? null;
}

export async function listShareLinksForFile(
  db: D1Database,
  fileId: string,
  userId: string,
  serviceId: string
): Promise<ShareLink[]> {
  const result = await db
    .prepare(
      'SELECT * FROM share_links WHERE file_id = ? AND user_id = ? AND service_id = ? ORDER BY created_at DESC'
    )
    .bind(fileId, userId, serviceId)
    .all<ShareLink>();
  return result.results ?? [];
}

export async function listShareLinksForUser(
  db: D1Database,
  userId: string,
  serviceId: string
): Promise<ShareLink[]> {
  const result = await db
    .prepare(
      'SELECT * FROM share_links WHERE user_id = ? AND service_id = ? ORDER BY created_at DESC'
    )
    .bind(userId, serviceId)
    .all<ShareLink>();
  return result.results ?? [];
}

export async function updateShareLink(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string,
  updates: UpdateShareLinkInput
): Promise<ShareLink | null> {
  const now = Math.floor(Date.now() / 1000);
  const setClauses: string[] = ['updated_at = ?'];
  const binds: (string | number | null)[] = [now];

  if (updates.name !== undefined) { setClauses.push('name = ?'); binds.push(updates.name); }
  if (updates.is_active !== undefined) { setClauses.push('is_active = ?'); binds.push(updates.is_active); }
  if (updates.password_hash !== undefined) { setClauses.push('password_hash = ?'); binds.push(updates.password_hash); }
  if (updates.expires_at !== undefined) { setClauses.push('expires_at = ?'); binds.push(updates.expires_at); }
  if (updates.max_downloads !== undefined) { setClauses.push('max_downloads = ?'); binds.push(updates.max_downloads); }

  const result = await db
    .prepare(
      `UPDATE share_links SET ${setClauses.join(', ')}
       WHERE id = ? AND user_id = ? AND service_id = ?`
    )
    .bind(...binds, id, userId, serviceId)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getShareLinkById(db, id);
}

export async function deleteShareLink(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM share_links WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deactivateShareLinksForFile(
  db: D1Database,
  fileId: string,
  serviceId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      'UPDATE share_links SET is_active = 0, updated_at = ? WHERE file_id = ? AND service_id = ?'
    )
    .bind(now, fileId, serviceId)
    .run();
}

export async function incrementDownloadCount(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare('UPDATE share_links SET download_count = download_count + 1 WHERE id = ?')
    .bind(id)
    .run();
}
