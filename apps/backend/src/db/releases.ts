export interface ReleaseRecord {
  id: string;
  service_id: string;
  name: string;
  size: number;
  r2_key: string;
  tags: string;           // JSON-encoded string[]
  notes: string | null;
  force_update: number;   // 0 or 1
  uploaded_by: string;
  upload_status: 'pending' | 'completed' | 'failed';
  presigned_url: string | null;
  presigned_expires_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReleaseDTO {
  id: string;
  service_id: string;
  name: string;
  size: number;
  r2_key: string;
  tags: string[];
  notes: string | null;
  force_update: boolean;
  uploaded_by: string;
  upload_status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

function mapRelease(row: ReleaseRecord): ReleaseDTO {
  return {
    id: row.id,
    service_id: row.service_id,
    name: row.name,
    size: row.size,
    r2_key: row.r2_key,
    tags: JSON.parse(row.tags) as string[],
    notes: row.notes,
    force_update: row.force_update === 1,
    uploaded_by: row.uploaded_by,
    upload_status: row.upload_status,
    created_at: new Date(row.created_at * 1000).toISOString(),
  };
}

export interface CreateReleaseInput {
  id: string;
  service_id: string;
  name: string;
  size: number;
  r2_key: string;
  tags: string[];
  notes?: string | null;
  force_update?: boolean;
  uploaded_by: string;
  presigned_url: string;
  presigned_expires_at: number;
}

export async function createRelease(db: D1Database, input: CreateReleaseInput): Promise<ReleaseDTO> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO releases
         (id, service_id, name, size, r2_key, tags, notes, force_update, uploaded_by,
          upload_status, presigned_url, presigned_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
      input.name,
      input.size,
      input.r2_key,
      JSON.stringify(input.tags),
      input.notes ?? null,
      input.force_update ? 1 : 0,
      input.uploaded_by,
      input.presigned_url,
      input.presigned_expires_at,
      now,
      now
    )
    .run();

  const created = await getRelease(db, input.id, input.service_id);
  if (!created) throw new Error('Failed to retrieve created release');
  return created;
}

export async function getRelease(db: D1Database, id: string, serviceId: string): Promise<ReleaseDTO | null> {
  const row = await db
    .prepare('SELECT * FROM releases WHERE id = ? AND service_id = ?')
    .bind(id, serviceId)
    .first<ReleaseRecord>();
  return row ? mapRelease(row) : null;
}

export async function completeRelease(db: D1Database, id: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE releases SET upload_status = 'completed', updated_at = ? WHERE id = ? AND upload_status = 'pending'`)
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function failRelease(db: D1Database, id: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(`UPDATE releases SET upload_status = 'failed', updated_at = ? WHERE id = ? AND upload_status = 'pending'`)
    .bind(now, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export interface ListReleasesInput {
  limit: number;
  cursor?: string | null;
}

export async function listReleases(
  db: D1Database,
  serviceId: string,
  input: ListReleasesInput
): Promise<{ items: ReleaseDTO[]; next_cursor: string | null }> {
  const binds: (string | number)[] = [serviceId];
  let cursorClause = '';

  if (input.cursor) {
    const sep = input.cursor.indexOf(':');
    if (sep > 0) {
      const ts = Number(input.cursor.slice(0, sep));
      const cid = input.cursor.slice(sep + 1);
      cursorClause = 'AND (created_at < ? OR (created_at = ? AND id < ?))';
      binds.push(ts, ts, cid);
    }
  }

  const rows = await db
    .prepare(
      `SELECT * FROM releases
       WHERE service_id = ? ${cursorClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .bind(...binds, input.limit + 1)
    .all<ReleaseRecord>();

  const items = rows.results ?? [];
  const hasMore = items.length > input.limit;
  const page = hasMore ? items.slice(0, input.limit) : items;
  const last = page[page.length - 1];
  return {
    items: page.map(mapRelease),
    next_cursor: hasMore && last ? `${last.created_at}:${last.id}` : null,
  };
}

export interface UpdateReleaseInput {
  name?: string;
  tags?: string[];
  notes?: string | null;
  force_update?: boolean;
  size?: number;
}

export async function updateRelease(
  db: D1Database,
  id: string,
  serviceId: string,
  input: UpdateReleaseInput
): Promise<ReleaseDTO | null> {
  const now = Math.floor(Date.now() / 1000);
  const setClauses: string[] = ['updated_at = ?'];
  const binds: (string | number | null)[] = [now];

  if (input.name !== undefined) { setClauses.push('name = ?'); binds.push(input.name); }
  if (input.tags !== undefined) { setClauses.push('tags = ?'); binds.push(JSON.stringify(input.tags)); }
  if (input.notes !== undefined) { setClauses.push('notes = ?'); binds.push(input.notes); }
  if (input.force_update !== undefined) { setClauses.push('force_update = ?'); binds.push(input.force_update ? 1 : 0); }
  if (input.size !== undefined) { setClauses.push('size = ?'); binds.push(input.size); }

  await db
    .prepare(`UPDATE releases SET ${setClauses.join(', ')} WHERE id = ? AND service_id = ?`)
    .bind(...binds, id, serviceId)
    .run();

  return getRelease(db, id, serviceId);
}

export async function deleteRelease(db: D1Database, id: string, serviceId: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM releases WHERE id = ? AND service_id = ?')
    .bind(id, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getLatestRelease(db: D1Database, serviceId: string): Promise<ReleaseDTO | null> {
  const row = await db
    .prepare(
      `SELECT * FROM releases
       WHERE service_id = ? AND upload_status = 'completed'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(serviceId)
    .first<ReleaseRecord>();
  return row ? mapRelease(row) : null;
}

export async function getLatestReleaseWithForceUpdate(db: D1Database, serviceId: string): Promise<ReleaseDTO | null> {
  const row = await db
    .prepare(
      `SELECT * FROM releases
       WHERE service_id = ? AND upload_status = 'completed' AND force_update = 1
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(serviceId)
    .first<ReleaseRecord>();
  return row ? mapRelease(row) : null;
}
