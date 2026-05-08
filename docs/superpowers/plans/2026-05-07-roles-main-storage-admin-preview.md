# Role System + MAIN_STORAGE + Admin Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three interdependent features: (1) enforce D1 roles (`user`, `plus`, `admin`) for feature gating; (2) MAIN_STORAGE — shared virtual storage accessible to `plus`/`admin` users, with separate quota, separate listing, and all standard file operations; (3) Admin preview — admins can access any user's private files via `X-Target-User-ID` header, with full audit trail.

**Architecture:**
- The `role` column already exists in `service_users` (migration 0003). No migration needed for roles, only for `is_main_storage` flag on `files`.
- A `requireRoleMiddleware(allowedRoles)` factory validates D1 role; API key callers bypass it.
- MAIN_STORAGE files share the same `files` table with `is_main_storage = 1` flag. They are not counted in private user quota; quota for MAIN_STORAGE is tracked at the service level as a separate counter (`main_used_bytes` on `services`).
- Admin preview: a middleware reads `X-Target-User-ID`, verifies the caller is admin, then substitutes the `userId` context variable. Every operation in target-user context emits an audit event with `actor_id`.

**Tech Stack:** Hono, Cloudflare Workers (D1), Vitest

---

## Files

- Create: `apps/backend/src/db/migrations/0009_main_storage.sql`
- Create: `apps/backend/src/middleware/requireRole.ts`
- Modify: `apps/backend/src/db/fileRecords.ts` — MAIN_STORAGE list/create
- Modify: `apps/backend/src/db/services.ts` — MAIN_STORAGE quota, extend audit actions
- Create: `apps/backend/src/routes/mainStorage.ts`
- Create: `apps/backend/src/middleware/adminPreview.ts`
- Modify: `apps/backend/src/routes/fileRecords.ts` — admin preview + `viewer_role`
- Modify: `apps/backend/src/routes/folders.ts` — admin preview
- Modify: `apps/backend/src/routes/admin.ts` — `updateUser` role support
- Modify: `apps/backend/src/index.ts` — mount mainStorage router + admin preview middleware
- Modify: `packages/unisource-sdk/src/services.ts` — extend `adminUserUpdateRequestSchema`
- Create: `packages/unisource-sdk/src/mainStorage.ts`
- Modify: `packages/unisource-sdk/src/client.ts` — `mainStorage.*` + `asUser` param
- Modify: `packages/unisource-sdk/src/index.ts` — export new schema/types
- Create: `apps/backend/test/roles.test.ts`
- Create: `apps/backend/test/main-storage.test.ts`
- Create: `apps/backend/test/admin-preview.test.ts`

---

### Task 1: D1 Migration — `is_main_storage` + `main_used_bytes`

**Files:**
- Create: `apps/backend/src/db/migrations/0009_main_storage.sql`

- [ ] **Step 1: Create the migration**

Create `apps/backend/src/db/migrations/0009_main_storage.sql`:

```sql
-- Add main storage flag to files
ALTER TABLE files ADD COLUMN is_main_storage INTEGER NOT NULL DEFAULT 0;

-- Add main storage quota counter to services
ALTER TABLE services ADD COLUMN main_used_bytes INTEGER NOT NULL DEFAULT 0;

-- Index for MAIN_STORAGE listing
CREATE INDEX idx_files_main_storage
  ON files(service_id, is_main_storage, created_at DESC)
  WHERE is_main_storage = 1;
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/db/migrations/0009_main_storage.sql
git commit -m "feat(backend): add is_main_storage flag and main_used_bytes quota column"
```

---

### Task 2: `requireRoleMiddleware`

**Files:**
- Create: `apps/backend/src/middleware/requireRole.ts`
- Create: `apps/backend/test/roles.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/test/roles.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, it, expect, vi } from 'vitest';
import { requireRoleMiddleware } from '../src/middleware/requireRole';

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return { ...actual, getServiceUser: vi.fn() };
});

import { getServiceUser } from '../src/db/services';

function buildRoleApp(allowedRoles: string[], userId: string, authType: 'appwrite' | 'apikey') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('authType', authType as WorkerVariables['authType']);
    c.set('isAdmin', false as WorkerVariables['isAdmin']);
    await next();
  });
  app.use('*', requireRoleMiddleware(allowedRoles));
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

const mockDb = { prepare: vi.fn() } as unknown as D1Database;
const env = { usrc_d1: mockDb } as unknown as CloudflareBindings;

describe('requireRoleMiddleware', () => {
  it('allows API key callers regardless of role', async () => {
    const app = buildRoleApp(['plus', 'admin'], 'system', 'apikey');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
  });

  it('blocks user with insufficient role', async () => {
    vi.mocked(getServiceUser).mockResolvedValue({ service_id: 'usrc', user_id: 'u1', role: 'user', max_storage_bytes: null, current_used_bytes: 0, created_at: 0 });
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(403);
  });

  it('allows user with matching role', async () => {
    vi.mocked(getServiceUser).mockResolvedValue({ service_id: 'usrc', user_id: 'u1', role: 'plus', max_storage_bytes: null, current_used_bytes: 0, created_at: 0 });
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(200);
  });

  it('returns 403 when user has no service_users record', async () => {
    vi.mocked(getServiceUser).mockResolvedValue(null);
    const app = buildRoleApp(['plus', 'admin'], 'u1', 'appwrite');
    const res = await app.fetch(new Request('http://localhost/protected'), env);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/roles.test.ts
```

Expected: FAIL — "requireRoleMiddleware is not a function".

- [ ] **Step 3: Implement `requireRole.ts`**

Create `apps/backend/src/middleware/requireRole.ts`:

```typescript
import { createMiddleware } from 'hono/factory';
import { getServiceUser } from '../db/services';

export function requireRoleMiddleware(allowedRoles: string[]) {
  return createMiddleware<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>(
    async (c, next) => {
      if (c.get('authType') === 'apikey') return next();

      const userId = c.get('userId');
      const serviceId = c.get('serviceId');
      const user = await getServiceUser(c.env.usrc_d1, serviceId, userId);

      if (!user || !allowedRoles.includes(user.role)) {
        return c.json({ error: 'Forbidden', message: 'Insufficient role' }, 403);
      }

      return next();
    }
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter backend test test/roles.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/middleware/requireRole.ts apps/backend/test/roles.test.ts
git commit -m "feat(backend): add requireRoleMiddleware for role-based access control"
```

---

### Task 3: MAIN_STORAGE DB functions

**Files:**
- Modify: `apps/backend/src/db/fileRecords.ts` — add MAIN_STORAGE list/create
- Modify: `apps/backend/src/db/services.ts` — add MAIN_STORAGE quota functions
- Modify: `apps/backend/test/main-storage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/test/main-storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createMainStorageFileRecord, listMainStorageFileRecords } from '../src/db/fileRecords';
import { reserveMainStorageQuota, releaseMainStorageQuota } from '../src/db/services';

function mockDbWithRecords(records: unknown[]): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: () => Promise.resolve({ meta: { changes: 1 }, results: [] }),
        all: () => Promise.resolve({ results: records }),
        first: () => Promise.resolve(records[0] ?? null),
      }),
    }),
  } as unknown as D1Database;
}

describe('createMainStorageFileRecord', () => {
  it('is exported from db/fileRecords', () => {
    expect(createMainStorageFileRecord).toBeDefined();
  });
});

describe('listMainStorageFileRecords', () => {
  it('returns files with is_main_storage=1', async () => {
    const fakeFile = {
      id: 'file-1',
      user_id: 'uploader',
      is_main_storage: 1,
      filename: 'shared.pdf',
      size: 2048,
      mime_type: 'application/pdf',
      storage_destination: 'r2',
      storage_key: 'main/shared.pdf',
      bucket: 'unisource',
      folder_id: null,
      is_trashed: 0,
      trashed_at: null,
      created_at: 1000,
      updated_at: 1000,
      service_id: 'usrc',
      upload_id: null,
    };
    const db = mockDbWithRecords([fakeFile]);
    const result = await listMainStorageFileRecords(db, 'usrc', { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('file-1');
  });
});

describe('reserveMainStorageQuota', () => {
  it('is exported from db/services', () => {
    expect(reserveMainStorageQuota).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/main-storage.test.ts
```

Expected: FAIL — functions not exported yet.

- [ ] **Step 3: Add MAIN_STORAGE functions to `db/fileRecords.ts`**

Add to `apps/backend/src/db/fileRecords.ts` (use the same `FileRecord` interface and cursor pattern already present):

```typescript
export interface ListMainStorageInput {
  limit: number;
  cursor?: string | null;
}

export async function createMainStorageFileRecord(
  db: D1Database,
  input: Omit<CreateFileRecordInput, 'folder_id'> & { uploaded_by: string }
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
    const separatorIndex = input.cursor.indexOf(':');
    if (separatorIndex > 0) {
      const cursorTs = Number(input.cursor.slice(0, separatorIndex));
      const cursorId = input.cursor.slice(separatorIndex + 1);
      cursorClause = 'AND (created_at < ? OR (created_at = ? AND id < ?))';
      binds.push(cursorTs, cursorTs, cursorId);
    }
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
    next_cursor: hasMore && last ? `${last.created_at}:${last.id}` : null,
  };
}
```

- [ ] **Step 4: Add MAIN_STORAGE quota functions to `db/services.ts`**

Add after `releaseQuota` in `apps/backend/src/db/services.ts`:

```typescript
export async function reserveMainStorageQuota(
  db: D1Database,
  serviceId: string,
  bytes: number
): Promise<{ ok: boolean }> {
  const result = await db
    .prepare(
      `UPDATE services
       SET main_used_bytes = main_used_bytes + ?
       WHERE id = ? AND (main_used_bytes + ?) <= max_storage_bytes`
    )
    .bind(bytes, serviceId, bytes)
    .run();
  return { ok: (result.meta.changes ?? 0) > 0 };
}

export async function releaseMainStorageQuota(
  db: D1Database,
  serviceId: string,
  bytes: number
): Promise<void> {
  await db
    .prepare('UPDATE services SET main_used_bytes = MAX(0, main_used_bytes - ?) WHERE id = ?')
    .bind(bytes, serviceId)
    .run();
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter backend test test/main-storage.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/fileRecords.ts apps/backend/src/db/services.ts apps/backend/test/main-storage.test.ts
git commit -m "feat(backend): add MAIN_STORAGE DB functions to fileRecords and services"
```

---

### Task 4: MAIN_STORAGE routes

**Files:**
- Create: `apps/backend/src/routes/mainStorage.ts`
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/test/main-storage.test.ts`

MAIN_STORAGE uses the existing upload flow (`/upload/r2/init`, `/upload/complete`) with the upload record's `folder_id` unused. After `complete`, instead of `createFileRecord`, call `createMainStorageFileRecord`.

The `GET /main` endpoint lists MAIN_STORAGE. All file operations (rename, delete, restore) reuse existing `fileRecords` DB functions but operate on MAIN_STORAGE files (filter by `is_main_storage = 1` added in DB layer or checked after fetch).

- [ ] **Step 1: Write failing tests**

Add to `apps/backend/test/main-storage.test.ts`:

```typescript
import { Hono } from 'hono';
import mainStorageRouter from '../src/routes/mainStorage';

vi.mock('../src/db/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/fileRecords')>();
  return {
    ...actual,
    listMainStorageFileRecords: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createMainStorageFileRecord: vi.fn(),
  };
});

vi.mock('../src/middleware/requireRole', () => ({
  requireRoleMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

function buildMainApp(userId = 'u1', serviceId = 'usrc') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('authType', 'appwrite' as WorkerVariables['authType']);
    c.set('isAdmin', false as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/main', mainStorageRouter);
  return app;
}

describe('GET /main', () => {
  it('returns 200 with empty list', async () => {
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main'), { usrc_d1: mockDbWithRecords([]) } as unknown as CloudflareBindings);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/main-storage.test.ts
```

Expected: FAIL — "mainStorage route not found".

- [ ] **Step 3: Create `routes/mainStorage.ts`**

Create `apps/backend/src/routes/mainStorage.ts`:

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { listMainStorageFileRecords, getFileRecord, updateFileRecord, trashFileRecord, restoreFileRecord, deleteFileRecordPermanently } from '../db/fileRecords';
import { requireRoleMiddleware } from '../middleware/requireRole';
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const mainStorage = new Hono<HonoEnv>();

// All MAIN_STORAGE routes require plus or admin role
mainStorage.use('*', requireRoleMiddleware(['plus', 'admin']));

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).default(FILES_DEFAULT_LIMIT),
  cursor: z.string().optional(),
});

mainStorage.get('/', zValidator('query', listQuerySchema), async (c) => {
  const { limit, cursor } = c.req.valid('query');
  const serviceId = c.get('serviceId');
  const result = await listMainStorageFileRecords(c.env.usrc_d1, serviceId, { limit, cursor });
  return c.json(result);
});

mainStorage.get('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.usrc_d1, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage || file.is_trashed) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  return c.json(file);
});

mainStorage.patch('/:id', zValidator('json', z.object({ filename: z.string().trim().min(1) })), async (c) => {
  const { filename } = c.req.valid('json');
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.usrc_d1, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  const updated = await updateFileRecord(c.env.usrc_d1, file.id, { filename });
  return c.json(updated);
});

mainStorage.delete('/:id', async (c) => {
  const serviceId = c.get('serviceId');
  const permanent = c.req.query('permanent') === 'true';
  const file = await getFileRecord(c.env.usrc_d1, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  if (permanent) {
    await deleteFileRecordPermanently(c.env.usrc_d1, file.id);
  } else {
    await trashFileRecord(c.env.usrc_d1, file.id);
  }
  return c.json({ success: true, file_id: file.id });
});

mainStorage.post('/:id/restore', async (c) => {
  const serviceId = c.get('serviceId');
  const file = await getFileRecord(c.env.usrc_d1, c.req.param('id'));
  if (!file || file.service_id !== serviceId || !file.is_main_storage) {
    return c.json({ error: 'Not Found', message: 'File not found in MAIN_STORAGE' }, 404);
  }
  await restoreFileRecord(c.env.usrc_d1, file.id);
  return c.json({ success: true, file_id: file.id });
});

export default mainStorage;
```

- [ ] **Step 4: Mount the router in `index.ts`**

Add import and mount in `apps/backend/src/index.ts`:

```typescript
import mainStorage from './routes/mainStorage';
```

Add before the public router mount:

```typescript
app.use('/main/*', authMiddleware);
app.route('/main', mainStorage);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm --filter backend test test/main-storage.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/mainStorage.ts apps/backend/src/index.ts apps/backend/test/main-storage.test.ts
git commit -m "feat(backend): add MAIN_STORAGE routes (GET/PATCH/DELETE/restore)"
```

---

### Task 5: Handle MAIN_STORAGE in upload `complete`

**Files:**
- Modify: `apps/backend/src/routes/upload.ts`

When a user completes an upload with `is_main_storage: true` in the request body, the `complete` handler must call `createMainStorageFileRecord` instead of `createFileRecord`, and use `reserveMainStorageQuota` / `releaseMainStorageQuota` instead of user quota.

- [ ] **Step 1: Extend `uploadLifecycleRequestSchema` in SDK**

In `packages/unisource-sdk/src/uploads.ts`, add `is_main_storage` field to the lifecycle schema:

```typescript
export const uploadLifecycleRequestSchema = z.object({
  upload_id: nonEmptyString,
  is_main_storage: z.boolean().optional().default(false),
});
```

- [ ] **Step 2: Run backend tests to confirm they still pass**

```bash
pnpm --filter backend test
```

Expected: All tests PASS (schema is additive/optional).

- [ ] **Step 3: Update `/complete` handler in `upload.ts`**

Add imports at top of `upload.ts`:

```typescript
import { createMainStorageFileRecord } from '../db/fileRecords';
import { reserveMainStorageQuota, releaseMainStorageQuota } from '../db/services';
```

In the `/complete` handler, replace the `if (userId !== 'system') { ... createFileRecord(...) }` block with:

```typescript
  if (userId !== 'system') {
    const isMainStorage = body.is_main_storage === true;
    const newFileId = crypto.randomUUID();

    if (isMainStorage) {
      await createMainStorageFileRecord(c.env.usrc_d1, {
        id: newFileId,
        service_id: serviceId,
        uploaded_by: userId,
        upload_id,
        filename: record.filename,
        size: record.size,
        mime_type: record.mime_type,
        storage_destination: record.destination,
        storage_key: record.storage_key,
        bucket: record.bucket,
      });
    } else {
      await createFileRecord(c.env.usrc_d1, {
        id: newFileId,
        service_id: serviceId,
        user_id: userId,
        folder_id: record.folder_id ?? null,
        upload_id,
        filename: record.filename,
        size: record.size,
        mime_type: record.mime_type,
        storage_destination: record.destination,
        storage_key: record.storage_key,
        bucket: record.bucket,
      });
    }

    c.executionCtx.waitUntil(
      logServiceEvent(c.env.usrc_d1, {
        serviceId,
        userId,
        action: 'upload_completed',
        resourceType: 'file',
        resourceId: newFileId,
        metadata: { filename: record.filename, size: record.size, is_main_storage: isMainStorage },
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
      })
    );
  }
```

Note: `is_main_storage` is read from `body`, so update the destructure at the top of the handler:

```typescript
const { upload_id, is_main_storage } = c.req.valid('json');
```

And fix the quota reservation in `/r2/init` and `/appwrite/init`: when the upload is flagged for MAIN_STORAGE, use `reserveMainStorageQuota` instead. Extend the init schemas to accept `is_main_storage?: boolean`.

In `upload.ts` `r2/init` handler, after the existing quota check:

```typescript
  const quotaResult = body.is_main_storage
    ? await reserveMainStorageQuota(c.env.usrc_d1, serviceId, size)
    : await reserveQuota(c.env.usrc_d1, serviceId, size, userId === 'system' ? null : userId);
  
  if (!quotaResult.ok) {
    // ... existing 409 response
  }
```

Also update `uploadR2InitRequestSchema` and `uploadAppwriteInitRequestSchema` in SDK to add `is_main_storage: z.boolean().optional().default(false)`.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts packages/unisource-sdk/src/uploads.ts
git commit -m "feat(backend): route MAIN_STORAGE uploads to separate quota and file record"
```

---

### Task 6: Admin Preview middleware

**Files:**
- Create: `apps/backend/src/middleware/adminPreview.ts`
- Create: `apps/backend/test/admin-preview.test.ts`
- Modify: `apps/backend/src/routes/fileRecords.ts`
- Modify: `apps/backend/src/routes/folders.ts`
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/test/admin-preview.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, it, expect, vi } from 'vitest';
import { adminPreviewMiddleware } from '../src/middleware/adminPreview';

function buildPreviewApp(isAdmin: boolean) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'admin-1' as WorkerVariables['userId']);
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('authType', 'appwrite' as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    await next();
  });
  app.use('*', adminPreviewMiddleware);
  app.get('/test', (c) => c.json({ userId: c.get('userId') }));
  return app;
}

const env = { usrc_d1: {} } as unknown as CloudflareBindings;

describe('adminPreviewMiddleware', () => {
  it('substitutes userId when admin provides X-Target-User-ID', async () => {
    const app = buildPreviewApp(true);
    const res = await app.fetch(
      new Request('http://localhost/test', { headers: { 'X-Target-User-ID': 'target-user' } }),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('target-user');
  });

  it('returns 403 when non-admin provides X-Target-User-ID', async () => {
    const app = buildPreviewApp(false);
    const res = await app.fetch(
      new Request('http://localhost/test', { headers: { 'X-Target-User-ID': 'target-user' } }),
      env
    );
    expect(res.status).toBe(403);
  });

  it('passes through unchanged when no X-Target-User-ID header', async () => {
    const app = buildPreviewApp(false);
    const res = await app.fetch(new Request('http://localhost/test'), env);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('admin-1');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/admin-preview.test.ts
```

Expected: FAIL — "adminPreviewMiddleware is not a function".

- [ ] **Step 3: Implement `adminPreview.ts`**

Create `apps/backend/src/middleware/adminPreview.ts`:

```typescript
import { createMiddleware } from 'hono/factory';

export const adminPreviewMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  const targetUserId = c.req.header('X-Target-User-ID');

  if (!targetUserId) return next();

  if (!c.get('isAdmin') && c.get('authType') !== 'apikey') {
    return c.json({ error: 'Forbidden', message: 'Admin access required to use X-Target-User-ID' }, 403);
  }

  // Store original actor for audit log, substitute userId context
  c.set('userId', targetUserId as WorkerVariables['userId']);

  return next();
});
```

Note: The audit log actor tracking requires passing `actor_id` alongside `target_user_id` in metadata. The routes must pass the original `userId` (from before substitution) to `logServiceEvent`. To support this, extend `WorkerVariables` in `worker-configuration.d.ts` with `actorId?: string`, set it in the middleware before substituting `userId`.

Update `adminPreview.ts`:

```typescript
export const adminPreviewMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables & { actorId?: string };
}>(async (c, next) => {
  const targetUserId = c.req.header('X-Target-User-ID');
  if (!targetUserId) return next();

  if (!c.get('isAdmin') && c.get('authType') !== 'apikey') {
    return c.json({ error: 'Forbidden', message: 'Admin access required to use X-Target-User-ID' }, 403);
  }

  c.set('actorId' as any, c.get('userId'));
  c.set('userId', targetUserId as WorkerVariables['userId']);
  return next();
});
```

And add `actorId?: string` to `WorkerVariables` in `apps/backend/worker-configuration.d.ts`:

```typescript
declare interface WorkerVariables {
  userId: string;
  serviceId: string;
  authType: 'appwrite' | 'apikey';
  isAdmin: boolean;
  actorId?: string;
}
```

- [ ] **Step 4: Apply middleware in `index.ts`**

In `apps/backend/src/index.ts`, add import:

```typescript
import { adminPreviewMiddleware } from './middleware/adminPreview';
```

Apply to `my-files` and `folders` routes (after auth):

```typescript
app.use('/my-files/*', authMiddleware);
app.use('/my-files/*', adminPreviewMiddleware);
app.route('/my-files', myFiles);

app.use('/folders/*', authMiddleware);
app.use('/folders/*', adminPreviewMiddleware);
app.route('/folders', folders);
```

- [ ] **Step 5: Add `viewer_role` to file list responses in `fileRecords.ts`**

The spec says backend must return `viewer_role: 'admin'` when admin is previewing. In `routes/fileRecords.ts`, on `GET /my-files` and `GET /my-files/:id`, append `viewer_role` to the response:

```typescript
const viewerRole = (c.get('actorId' as any)) ? 'admin' : 'user';
return c.json({ ...result, viewer_role: viewerRole });
```

- [ ] **Step 6: Add audit logging for admin preview operations in `fileRecords.ts`**

Wherever `logServiceEvent` is called in `fileRecords.ts` routes, include `actor_id` in metadata when `actorId` is set:

```typescript
const actorId = c.get('actorId' as any) as string | undefined;
const auditMetadata = actorId
  ? { ...existingMetadata, actor_id: actorId, target_user_id: c.get('userId') }
  : existingMetadata;
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter backend test test/admin-preview.test.ts
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/middleware/adminPreview.ts apps/backend/src/index.ts apps/backend/src/routes/fileRecords.ts apps/backend/src/routes/folders.ts apps/backend/worker-configuration.d.ts apps/backend/test/admin-preview.test.ts
git commit -m "feat(backend): admin preview via X-Target-User-ID with audit trail"
```

---

### Task 7: Extend SDK — roles, MAIN_STORAGE, asUser

**Files:**
- Modify: `packages/unisource-sdk/src/services.ts`
- Create: `packages/unisource-sdk/src/mainStorage.ts`
- Modify: `packages/unisource-sdk/src/client.ts`
- Modify: `packages/unisource-sdk/src/index.ts`

- [ ] **Step 1: Extend `adminUserUpdateRequestSchema` with role field**

In `packages/unisource-sdk/src/services.ts`, find `adminUserUpdateRequestSchema` and add `role`:

```typescript
export const adminUserUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['user', 'plus', 'admin']).optional(),
  max_storage_bytes: z.number().int().positive().nullable().optional(),
  status: z.boolean().optional(),
});
```

- [ ] **Step 2: Create `mainStorage.ts` in SDK**

Create `packages/unisource-sdk/src/mainStorage.ts`:

```typescript
import { z } from 'zod';
import { fileRecordSchema } from './fileRecords';
import { nonEmptyString, positiveInt } from './primitives';

export const mainStorageListQuerySchema = z.object({
  limit: positiveInt.optional(),
  cursor: nonEmptyString.optional(),
});

export const mainStorageListResponseSchema = z.object({
  items: z.array(fileRecordSchema),
  next_cursor: z.string().nullable(),
});

export const mainStorageRenameRequestSchema = z.object({
  filename: nonEmptyString,
});

export const mainStorageDeleteResponseSchema = z.object({
  success: z.boolean(),
  file_id: nonEmptyString,
});

export const mainStorageRestoreResponseSchema = z.object({
  success: z.boolean(),
  file_id: nonEmptyString,
});

export type MainStorageListQuery = z.infer<typeof mainStorageListQuerySchema>;
export type MainStorageListResponse = z.infer<typeof mainStorageListResponseSchema>;
export type MainStorageRenameRequest = z.infer<typeof mainStorageRenameRequestSchema>;
export type MainStorageDeleteResponse = z.infer<typeof mainStorageDeleteResponseSchema>;
export type MainStorageRestoreResponse = z.infer<typeof mainStorageRestoreResponseSchema>;
```

- [ ] **Step 3: Add `mainStorage.*` namespace to `client.ts`**

In `packages/unisource-sdk/src/client.ts`, add a `mainStorage` namespace to `UnisourceClient`:

```typescript
mainStorage = {
  list: (query?: MainStorageListQuery): Promise<MainStorageListResponse> =>
    this.get('/main', query),

  get: (fileId: string): Promise<FileRecord> =>
    this.get(`/main/${fileId}`),

  rename: (fileId: string, filename: string): Promise<FileRecord> =>
    this.patch(`/main/${fileId}`, { filename }),

  delete: (fileId: string, permanent = false): Promise<MainStorageDeleteResponse> =>
    this.delete(`/main/${fileId}${permanent ? '?permanent=true' : ''}`),

  restore: (fileId: string): Promise<MainStorageRestoreResponse> =>
    this.post(`/main/${fileId}/restore`, {}),

  upload: {
    r2Init: (input: UploadR2InitRequest & { is_main_storage: true }): Promise<UploadR2InitResponse> =>
      this.post('/upload/r2/init', input),

    appwriteInit: (input: UploadAppwriteInitRequest & { is_main_storage: true }): Promise<UploadAppwriteInitResponse> =>
      this.post('/upload/appwrite/init', input),

    complete: (uploadId: string): Promise<UploadCompleteResponse> =>
      this.post('/upload/complete', { upload_id: uploadId, is_main_storage: true }),

    fail: (uploadId: string): Promise<UploadFailResponse> =>
      this.post('/upload/fail', { upload_id: uploadId }),
  },
};
```

- [ ] **Step 4: Add `asUser` option to `myFiles` and `folders` methods**

In `client.ts`, update all `myFiles.*` and `folders.*` methods to accept an optional `options?: { asUser?: string }` parameter. When `asUser` is provided, add `X-Target-User-ID` header:

```typescript
private buildOptions(options?: { asUser?: string }): RequestInit | undefined {
  if (!options?.asUser) return undefined;
  return { headers: { 'X-Target-User-ID': options.asUser } };
}
```

Then each method becomes e.g.:

```typescript
myFiles = {
  list: (query?: FileRecordsListQuery, options?: { asUser?: string }): Promise<FileRecordsListResponse> =>
    this.get('/my-files', query, this.buildOptions(options)),
  // ... etc
};
```

Update the internal `get/post/patch/delete` helpers to accept an extra `options?: RequestInit` parameter.

- [ ] **Step 5: Export new types from `index.ts`**

In `packages/unisource-sdk/src/index.ts`, add:

```typescript
export * from './mainStorage';
```

- [ ] **Step 6: Build SDK to verify no TypeScript errors**

```bash
pnpm --filter @unisource/sdk build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/unisource-sdk/src/
git commit -m "feat(sdk): add mainStorage namespace, asUser option, role field in adminUserUpdate"
```
