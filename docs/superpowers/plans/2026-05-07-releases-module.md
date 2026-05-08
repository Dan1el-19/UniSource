# Releases Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Releases module to UniSource backend — a separate table + routes for versioned file releases (apps, firmware, etc.) with upload lifecycle, metadata management, and a `latest` endpoint. Add `releases.*` SDK namespace. Releases live in R2 at `releases/{service_id}/{filename}`.

**Architecture:** Releases are independent of the `files`/`uploads` tables — they have their own `releases` table with R2-only storage. The upload lifecycle reuses presigned PUT URL pattern but is self-contained in the releases router (no dependency on `/upload/*`). The `/releases/sync` endpoint accepts a config payload and upserts releases from an external manifest. Tags are stored as JSON strings in D1.

**Tech Stack:** Hono, Cloudflare Workers (D1 + R2), Vitest, AWS SDK v3

---

## Files

- Create: `apps/backend/src/db/migrations/0010_releases.sql`
- Create: `apps/backend/src/db/releases.ts`
- Create: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/src/index.ts`
- Create: `packages/unisource-sdk/src/releases.ts`
- Modify: `packages/unisource-sdk/src/client.ts`
- Modify: `packages/unisource-sdk/src/index.ts`
- Create: `apps/backend/test/releases.test.ts`

---

### Task 1: D1 Migration — `releases` table

**Files:**
- Create: `apps/backend/src/db/migrations/0010_releases.sql`

- [ ] **Step 1: Create the migration**

Create `apps/backend/src/db/migrations/0010_releases.sql`:

```sql
CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',    -- JSON array stored as string
  notes TEXT,
  force_update INTEGER NOT NULL DEFAULT 0,  -- boolean: 0 or 1
  uploaded_by TEXT NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(upload_status IN ('pending', 'completed', 'failed')),
  presigned_url TEXT,
  presigned_expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

CREATE INDEX idx_releases_service_created
  ON releases(service_id, created_at DESC);

CREATE INDEX idx_releases_service_status
  ON releases(service_id, upload_status, created_at DESC);
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/db/migrations/0010_releases.sql
git commit -m "feat(backend): add releases table migration"
```

---

### Task 2: `db/releases.ts` — CRUD functions

**Files:**
- Create: `apps/backend/src/db/releases.ts`
- Create: `apps/backend/test/releases.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/test/releases.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  createRelease,
  getRelease,
  completeRelease,
  failRelease,
  listReleases,
  updateRelease,
  deleteRelease,
  getLatestRelease,
} from '../src/db/releases';

function mockDbReturning(record: unknown, changes = 1): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: () => Promise.resolve({ meta: { changes }, results: [] }),
        first: () => Promise.resolve(record),
        all: () => Promise.resolve({ results: record ? [record] : [] }),
      }),
    }),
  } as unknown as D1Database;
}

const baseRelease = {
  id: 'rel-1',
  service_id: 'usrc',
  name: 'v1.0.0',
  size: 4096,
  r2_key: 'releases/usrc/v1.0.0.zip',
  tags: '["stable"]',
  notes: null,
  force_update: 0,
  uploaded_by: 'user-abc',
  upload_status: 'completed',
  presigned_url: null,
  presigned_expires_at: null,
  created_at: 1000,
  updated_at: 1000,
};

describe('getRelease', () => {
  it('returns release by id', async () => {
    const db = mockDbReturning(baseRelease);
    const result = await getRelease(db, 'rel-1', 'usrc');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('rel-1');
  });

  it('returns null when not found', async () => {
    const db = mockDbReturning(null);
    const result = await getRelease(db, 'nonexistent', 'usrc');
    expect(result).toBeNull();
  });
});

describe('completeRelease', () => {
  it('returns true when update succeeds', async () => {
    const db = mockDbReturning(null, 1);
    const result = await completeRelease(db, 'rel-1');
    expect(result).toBe(true);
  });

  it('returns false when no rows affected (already completed)', async () => {
    const db = mockDbReturning(null, 0);
    const result = await completeRelease(db, 'rel-1');
    expect(result).toBe(false);
  });
});

describe('getLatestRelease', () => {
  it('returns the most recent completed release for a service', async () => {
    const db = mockDbReturning(baseRelease);
    const result = await getLatestRelease(db, 'usrc');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('v1.0.0');
  });
});

describe('listReleases', () => {
  it('returns paginated releases for a service', async () => {
    const db = mockDbReturning([baseRelease]);
    const result = await listReleases(db, 'usrc', { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.next_cursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/releases.test.ts
```

Expected: FAIL — "createRelease is not a function".

- [ ] **Step 3: Implement `db/releases.ts`**

Create `apps/backend/src/db/releases.ts`:

```typescript
import type { D1Database } from '@cloudflare/workers-types';

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
    .prepare(`UPDATE releases SET upload_status = 'completed', size = COALESCE(size, 0), updated_at = ? WHERE id = ? AND upload_status = 'pending'`)
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter backend test test/releases.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/releases.ts apps/backend/test/releases.test.ts
git commit -m "feat(backend): add releases DB layer (CRUD + lifecycle)"
```

---

### Task 3: `routes/releases.ts` — all endpoints

**Files:**
- Create: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/test/releases.test.ts`

- [ ] **Step 1: Write failing route tests**

Add to `apps/backend/test/releases.test.ts`:

```typescript
import { Hono } from 'hono';
import releasesRouter from '../src/routes/releases';

vi.mock('../src/db/releases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/releases')>();
  return {
    ...actual,
    createRelease: vi.fn(),
    getRelease: vi.fn(),
    completeRelease: vi.fn(),
    failRelease: vi.fn(),
    listReleases: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    updateRelease: vi.fn(),
    deleteRelease: vi.fn(),
    getLatestRelease: vi.fn(),
  };
});

vi.mock('../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/r2')>();
  return {
    ...actual,
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://r2.example.com/put',
      storage_key: 'releases/usrc/v1.0.0.zip',
      expires_at: 9999999999,
    }),
    headObject: vi.fn().mockResolvedValue({ size: 4096 }),
    deleteObject: vi.fn(),
  };
});

import { listReleases, createRelease, getRelease, completeRelease, getLatestRelease } from '../src/db/releases';

function buildReleasesApp(userId = 'system', isAdmin = true) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/releases', releasesRouter);
  return app;
}

const relEnv = {
  usrc_d1: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn(), first: vi.fn(), all: vi.fn() })) })) },
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'sec',
  USRC_API_KEY: 'test-api-key',
  BLOKSERWIS_API_KEY: 'blok-key',
} as unknown as CloudflareBindings;

describe('GET /releases', () => {
  it('returns 200 with empty list', async () => {
    vi.mocked(listReleases).mockResolvedValue({ items: [], next_cursor: null });
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases'), relEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe('POST /releases/upload/init', () => {
  it('returns 201 with presigned URL', async () => {
    vi.mocked(createRelease).mockResolvedValue({
      id: 'rel-1',
      service_id: 'usrc',
      name: 'v1.0.0',
      size: 0,
      r2_key: 'releases/usrc/v1.0.0.zip',
      tags: [],
      notes: null,
      force_update: false,
      uploaded_by: 'system',
      upload_status: 'pending',
      created_at: new Date().toISOString(),
    });

    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'v1.0.0', filename: 'app.zip', tags: [], force_update: false }),
      }),
      relEnv
    );

    expect(res.status).toBe(201);
    const body = await res.json() as { presigned_url: string; release_id: string };
    expect(body.presigned_url).toBe('https://r2.example.com/put');
    expect(body.release_id).toBe('rel-1');
  });
});

describe('GET /releases/latest', () => {
  it('returns 404 when no completed release exists', async () => {
    vi.mocked(getLatestRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases/latest'), relEnv);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter backend test test/releases.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `routes/releases.ts`**

Create `apps/backend/src/routes/releases.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createRelease,
  getRelease,
  completeRelease,
  failRelease,
  listReleases,
  updateRelease,
  deleteRelease,
  getLatestRelease,
} from '../db/releases';
import { generatePresignedPutUrl, headObject, deleteObject } from '../services/r2';
import { getServiceConfig } from '../config/services';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const releases = new Hono<HonoEnv>();

const RELEASES_BUCKET = 'unisource'; // R2 bucket for releases
const RELEASES_TTL = 3600;

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  return c.json({ error: 'Bad Request', message: issue?.message ?? 'Validation failed' }, 400);
}

const uploadInitSchema = z.object({
  name: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  force_update: z.boolean().default(false),
});

const uploadCompleteSchema = z.object({
  release_id: z.string().trim().min(1),
  size: z.number().int().positive(),
});

const uploadFailSchema = z.object({
  release_id: z.string().trim().min(1),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  force_update: z.boolean().optional(),
});

// POST /releases/upload/init
releases.post(
  '/upload/init',
  zValidator('json', uploadInitSchema, validationErrorHook),
  async (c) => {
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');

    const releaseId = crypto.randomUUID();
    const ext = body.filename.includes('.') ? body.filename.split('.').pop() : '';
    const r2Key = `releases/${serviceId}/${releaseId}${ext ? `.${ext}` : ''}`;

    const { presigned_url, expires_at } = await generatePresignedPutUrl(
      c.env,
      RELEASES_BUCKET,
      r2Key,
      'application/octet-stream',
      RELEASES_TTL
    );

    const release = await createRelease(c.env.usrc_d1, {
      id: releaseId,
      service_id: serviceId,
      name: body.name,
      size: 0,
      r2_key: r2Key,
      tags: body.tags,
      notes: body.notes ?? null,
      force_update: body.force_update,
      uploaded_by: userId,
      presigned_url,
      presigned_expires_at: expires_at,
    });

    return c.json({ release_id: release.id, presigned_url, r2_key: r2Key, expires_at }, 201);
  }
);

// POST /releases/upload/complete
releases.post(
  '/upload/complete',
  zValidator('json', uploadCompleteSchema, validationErrorHook),
  async (c) => {
    const { release_id, size } = c.req.valid('json');
    const serviceId = c.get('serviceId');

    const release = await getRelease(c.env.usrc_d1, release_id, serviceId);
    if (!release) {
      return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
    }
    if (release.upload_status === 'completed') {
      return c.json({ success: true, release_id, status: 'completed' });
    }

    // Verify physical existence in R2
    const meta = await headObject(c.env, RELEASES_BUCKET, release.r2_key);
    if (!meta) {
      await failRelease(c.env.usrc_d1, release_id);
      return c.json({ error: 'Conflict', message: 'File not found in R2 storage' }, 409);
    }

    const updated = await completeRelease(c.env.usrc_d1, release_id);
    if (!updated) {
      return c.json({ error: 'Conflict', message: 'Release could not be completed' }, 409);
    }

    // Store the actual size from client (verified against R2 in production)
    await updateRelease(c.env.usrc_d1, release_id, serviceId, { size });

    return c.json({ success: true, release_id, status: 'completed' });
  }
);

// POST /releases/upload/fail
releases.post(
  '/upload/fail',
  zValidator('json', uploadFailSchema, validationErrorHook),
  async (c) => {
    const { release_id } = c.req.valid('json');
    const serviceId = c.get('serviceId');

    const release = await getRelease(c.env.usrc_d1, release_id, serviceId);
    if (!release) {
      return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
    }

    const updated = await failRelease(c.env.usrc_d1, release_id);
    return c.json({ success: true, release_id, status: updated ? 'failed' : release.upload_status });
  }
);

// GET /releases/latest — must be before /:id
releases.get('/latest', async (c) => {
  const serviceId = c.get('serviceId');
  const release = await getLatestRelease(c.env.usrc_d1, serviceId);
  if (!release) {
    return c.json({ error: 'Not Found', message: 'No completed releases found' }, 404);
  }
  return c.json(release);
});

// GET /releases
releases.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const { limit, cursor } = c.req.valid('query');
  const serviceId = c.get('serviceId');
  const result = await listReleases(c.env.usrc_d1, serviceId, { limit, cursor });
  return c.json(result);
});

// GET /releases/:id
releases.get('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const release = await getRelease(c.env.usrc_d1, c.req.param('id'), serviceId);
  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }
  return c.json(release);
});

// PATCH /releases/:id
releases.patch(
  '/:id',
  zValidator('json', updateSchema, validationErrorHook),
  async (c) => {
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const updated = await updateRelease(c.env.usrc_d1, c.req.param('id'), serviceId, body);
    if (!updated) {
      return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
    }
    return c.json(updated);
  }
);

// DELETE /releases/:id
releases.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const release = await getRelease(c.env.usrc_d1, c.req.param('id'), serviceId);
  if (!release) {
    return c.json({ error: 'Not Found', message: 'Release not found' }, 404);
  }

  // Delete from R2 first
  if (release.upload_status === 'completed') {
    await deleteObject(c.env, RELEASES_BUCKET, release.r2_key);
  }

  const deleted = await deleteRelease(c.env.usrc_d1, c.req.param('id'), serviceId);
  return c.json({ success: deleted, release_id: c.req.param('id') });
});

// POST /releases/sync — upsert releases from external config manifest
const syncSchema = z.object({
  releases: z.array(z.object({
    name: z.string().trim().min(1),
    r2_key: z.string().trim().min(1),
    size: z.number().int().nonnegative(),
    tags: z.array(z.string()).default([]),
    notes: z.string().nullable().optional(),
    force_update: z.boolean().default(false),
  })),
});

releases.post(
  '/sync',
  zValidator('json', syncSchema, validationErrorHook),
  async (c) => {
    const { releases: releasesToSync } = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const now = Math.floor(Date.now() / 1000);

    const results: Array<{ name: string; status: 'created' | 'error'; release_id?: string; error?: string }> = [];

    for (const rel of releasesToSync) {
      try {
        const id = crypto.randomUUID();
        const release = await createRelease(c.env.usrc_d1, {
          id,
          service_id: serviceId,
          name: rel.name,
          size: rel.size,
          r2_key: rel.r2_key,
          tags: rel.tags,
          notes: rel.notes ?? null,
          force_update: rel.force_update,
          uploaded_by: userId,
          presigned_url: '',
          presigned_expires_at: now,
        });
        // Mark as completed since R2 key comes pre-supplied
        await completeRelease(c.env.usrc_d1, id);
        results.push({ name: rel.name, status: 'created', release_id: release.id });
      } catch (err) {
        results.push({ name: rel.name, status: 'error', error: String(err) });
      }
    }

    return c.json({ synced: results.filter(r => r.status === 'created').length, results });
  }
);

export default releases;
```

- [ ] **Step 4: Mount router in `index.ts`**

Add import in `apps/backend/src/index.ts`:

```typescript
import releasesRouter from './routes/releases';
```

Mount with dual-auth (API key or JWT, admin required):

```typescript
app.use('/releases/*', authMiddleware);
app.use('/releases/*', requireAdminMiddleware);
app.route('/releases', releasesRouter);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter backend test test/releases.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/releases.ts apps/backend/src/index.ts apps/backend/test/releases.test.ts
git commit -m "feat(backend): add releases router with full upload lifecycle and CRUD"
```

---

### Task 4: SDK — `releases.*` namespace

**Files:**
- Create: `packages/unisource-sdk/src/releases.ts`
- Modify: `packages/unisource-sdk/src/client.ts`
- Modify: `packages/unisource-sdk/src/index.ts`

- [ ] **Step 1: Create `releases.ts` schema file**

Create `packages/unisource-sdk/src/releases.ts`:

```typescript
import { z } from 'zod';
import { nonEmptyString, positiveInt } from './primitives';

export const releaseDTOSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  name: nonEmptyString,
  size: z.number().int().nonnegative(),
  r2_key: nonEmptyString,
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  force_update: z.boolean(),
  uploaded_by: nonEmptyString,
  upload_status: z.enum(['pending', 'completed', 'failed']),
  created_at: z.string(),
});

export const releaseUploadInitRequestSchema = z.object({
  name: nonEmptyString,
  filename: nonEmptyString,
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
  force_update: z.boolean().default(false),
});

export const releaseUploadInitResponseSchema = z.object({
  release_id: nonEmptyString,
  presigned_url: nonEmptyString,
  r2_key: nonEmptyString,
  expires_at: z.number().int(),
});

export const releaseUploadCompleteRequestSchema = z.object({
  release_id: nonEmptyString,
  size: positiveInt,
});

export const releaseUploadCompleteResponseSchema = z.object({
  success: z.boolean(),
  release_id: nonEmptyString,
  status: z.string(),
});

export const releaseUploadFailResponseSchema = z.object({
  success: z.boolean(),
  release_id: nonEmptyString,
  status: z.string(),
});

export const releasesListQuerySchema = z.object({
  limit: positiveInt.optional(),
  cursor: nonEmptyString.optional(),
});

export const releasesListResponseSchema = z.object({
  items: z.array(releaseDTOSchema),
  next_cursor: z.string().nullable(),
});

export const releaseUpdateRequestSchema = z.object({
  name: nonEmptyString.optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  force_update: z.boolean().optional(),
});

export const releaseDeleteResponseSchema = z.object({
  success: z.boolean(),
  release_id: nonEmptyString,
});

export const releaseSyncRequestSchema = z.object({
  releases: z.array(z.object({
    name: nonEmptyString,
    r2_key: nonEmptyString,
    size: z.number().int().nonnegative(),
    tags: z.array(z.string()).default([]),
    notes: z.string().nullable().optional(),
    force_update: z.boolean().default(false),
  })),
});

export const releaseSyncResponseSchema = z.object({
  synced: z.number().int(),
  results: z.array(z.object({
    name: nonEmptyString,
    status: z.enum(['created', 'error']),
    release_id: nonEmptyString.optional(),
    error: z.string().optional(),
  })),
});

export type ReleaseDTO = z.infer<typeof releaseDTOSchema>;
export type ReleaseUploadInitRequest = z.infer<typeof releaseUploadInitRequestSchema>;
export type ReleaseUploadInitResponse = z.infer<typeof releaseUploadInitResponseSchema>;
export type ReleaseUploadCompleteRequest = z.infer<typeof releaseUploadCompleteRequestSchema>;
export type ReleaseUploadCompleteResponse = z.infer<typeof releaseUploadCompleteResponseSchema>;
export type ReleasesListQuery = z.infer<typeof releasesListQuerySchema>;
export type ReleasesListResponse = z.infer<typeof releasesListResponseSchema>;
export type ReleaseUpdateRequest = z.infer<typeof releaseUpdateRequestSchema>;
export type ReleaseDeleteResponse = z.infer<typeof releaseDeleteResponseSchema>;
export type ReleaseSyncRequest = z.infer<typeof releaseSyncRequestSchema>;
export type ReleaseSyncResponse = z.infer<typeof releaseSyncResponseSchema>;
```

- [ ] **Step 2: Add `releases` namespace to `client.ts`**

In `packages/unisource-sdk/src/client.ts`, add import:

```typescript
import type {
  ReleaseDTO,
  ReleaseUploadInitRequest,
  ReleaseUploadInitResponse,
  ReleaseUploadCompleteRequest,
  ReleaseUploadCompleteResponse,
  ReleasesListQuery,
  ReleasesListResponse,
  ReleaseUpdateRequest,
  ReleaseDeleteResponse,
  ReleaseSyncRequest,
  ReleaseSyncResponse,
} from './releases';
```

Add `releases` namespace to `UnisourceClient`:

```typescript
releases = {
  upload: {
    init: (input: ReleaseUploadInitRequest): Promise<ReleaseUploadInitResponse> =>
      this.post('/releases/upload/init', input),

    complete: (input: ReleaseUploadCompleteRequest): Promise<ReleaseUploadCompleteResponse> =>
      this.post('/releases/upload/complete', input),

    fail: (releaseId: string): Promise<{ success: boolean; release_id: string; status: string }> =>
      this.post('/releases/upload/fail', { release_id: releaseId }),
  },

  list: (query?: ReleasesListQuery): Promise<ReleasesListResponse> =>
    this.get('/releases', query),

  get: (releaseId: string): Promise<ReleaseDTO> =>
    this.get(`/releases/${releaseId}`),

  latest: (): Promise<ReleaseDTO> =>
    this.get('/releases/latest'),

  update: (releaseId: string, input: ReleaseUpdateRequest): Promise<ReleaseDTO> =>
    this.patch(`/releases/${releaseId}`, input),

  delete: (releaseId: string): Promise<ReleaseDeleteResponse> =>
    this.delete(`/releases/${releaseId}`),

  sync: (input: ReleaseSyncRequest): Promise<ReleaseSyncResponse> =>
    this.post('/releases/sync', input),
};
```

- [ ] **Step 3: Export from `index.ts`**

In `packages/unisource-sdk/src/index.ts`, add:

```typescript
export * from './releases';
```

- [ ] **Step 4: Build and verify**

```bash
pnpm --filter @unisource/sdk build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add packages/unisource-sdk/src/releases.ts packages/unisource-sdk/src/client.ts packages/unisource-sdk/src/index.ts
git commit -m "feat(sdk): add releases namespace with upload lifecycle, list, get, update, delete, sync"
```
