# Upload Hardening + Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `/upload/complete` with physical file existence + size verification; add rate limiting to `/public/:slug/unlock` against brute-force.

**Architecture:** Add `headObject` to R2 service and `getAppwriteFileMeta` to Appwrite service; call them in `/complete` before finalizing the upload; on failure: fail the upload record + release quota; `completeUpload()` already uses `AND status='pending'` for atomic race protection. Apply existing `rateLimitMiddleware` to the unlock endpoint.

**Tech Stack:** Hono, Cloudflare Workers (D1 + R2), AWS SDK v3 (`HeadObjectCommand`), Appwrite REST API (`GET /v1/storage/buckets/{b}/files/{f}`), Vitest

---

## Files

- Modify: `apps/backend/src/services/r2.ts` — add `headObject()`
- Modify: `apps/backend/src/services/appwrite.ts` — add `getAppwriteFileMeta()`
- Modify: `apps/backend/src/routes/upload.ts` — physical verification in `/complete`
- Modify: `apps/backend/src/routes/public.ts` — rate limit on `/unlock`
- Create: `apps/backend/test/upload-hardening.test.ts`

---

### Task 1: Add `headObject` to R2 service

**Files:**
- Modify: `apps/backend/src/services/r2.ts`
- Create: `apps/backend/test/upload-hardening.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/test/upload-hardening.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadRecord } from '../src/db/files';

// Module mocks — must be declared before imports of the mocked modules
vi.mock('../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/r2')>();
  return {
    ...actual,
    headObject: vi.fn(),
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'key',
      expires_at: 9999999999,
    }),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
  };
});

vi.mock('../src/services/appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/appwrite')>();
  return {
    ...actual,
    getAppwriteFileMeta: vi.fn(),
  };
});

vi.mock('../src/db/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/files')>();
  return {
    ...actual,
    getUpload: vi.fn(),
    getUploadForUser: vi.fn(),
    completeUpload: vi.fn(),
    failUpload: vi.fn(),
    createUpload: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../src/db/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/fileRecords')>();
  return { ...actual, createFileRecord: vi.fn() };
});

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return {
    ...actual,
    releaseQuota: vi.fn(),
    logServiceEvent: vi.fn(),
    reserveQuota: vi.fn().mockResolvedValue({ ok: true }),
    ensureServiceUser: vi.fn(),
  };
});

import { headObject } from '../src/services/r2';
import { getAppwriteFileMeta } from '../src/services/appwrite';
import { getUpload, failUpload, completeUpload } from '../src/db/files';
import upload from '../src/routes/upload';
import publicRouter from '../src/routes/public';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pendingR2Record: UploadRecord = {
  id: 'upload-123',
  service_id: 'usrc',
  user_id: null,
  folder_id: null,
  filename: 'test.pdf',
  size: 1024,
  mime_type: 'application/pdf',
  destination: 'r2',
  storage_key: 'usrc/uploads/2026/01/01/upload-123.pdf',
  bucket: 'unisource',
  status: 'pending',
  presigned_url: null,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000),
};

function mockD1(changes = 1): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ meta: { changes }, results: [] }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

const baseEnv = {
  usrc_d1: mockD1(),
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  APPWRITE_ENDPOINT: 'https://aw.test/v1',
  APPWRITE_PROJECT_ID: 'proj',
  APPWRITE_BUCKET_ID: 'bucket',
  APPWRITE_API_KEY: 'ak',
  USRC_API_KEY: 'test-api-key',
  BLOKSERWIS_API_KEY: 'blok-api-key',
} as unknown as CloudflareBindings;

function buildUploadApp(userId = 'system', serviceId = 'usrc') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/upload', upload);
  return app;
}

function buildPublicApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.route('/public', publicRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Task 1: headObject
// ---------------------------------------------------------------------------

describe('headObject — R2 service', () => {
  it('is exported from services/r2', () => {
    expect(headObject).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: FAIL — "headObject is not a function" or module export missing.

- [ ] **Step 3: Implement `headObject` in `r2.ts`**

Add `HeadObjectCommand` to the existing import in `apps/backend/src/services/r2.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
```

Add after `deleteObject`:

```typescript
export interface R2ObjectMeta {
  size: number;
}

export async function headObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<R2ObjectMeta | null> {
  const client = createS3Client(env);
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: result.ContentLength ?? 0 };
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/r2.ts apps/backend/test/upload-hardening.test.ts
git commit -m "feat(backend): add headObject to R2 service"
```

---

### Task 2: Add `getAppwriteFileMeta` to Appwrite service

**Files:**
- Modify: `apps/backend/src/services/appwrite.ts`
- Modify: `apps/backend/test/upload-hardening.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `upload-hardening.test.ts` describe block for Appwrite:

```typescript
describe('getAppwriteFileMeta — Appwrite service', () => {
  it('is exported from services/appwrite', () => {
    expect(getAppwriteFileMeta).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: FAIL — "getAppwriteFileMeta is not a function".

- [ ] **Step 3: Implement `getAppwriteFileMeta` in `appwrite.ts`**

Add after `deleteAppwriteFile` in `apps/backend/src/services/appwrite.ts`:

```typescript
export interface AppwriteFileMeta {
  size: number;
}

export async function getAppwriteFileMeta(
  env: CloudflareBindings,
  bucketId: string,
  fileId: string
): Promise<AppwriteFileMeta | null> {
  const baseUrl = getAppwriteApiBaseUrl(env);
  const url = `${baseUrl}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}`;

  const response = await fetch(url, { headers: createAppwriteHeaders(env) });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Appwrite getFileMeta failed (${response.status}): ${body}`);
  }

  const data = await response.json<{ sizeOriginal: number }>();
  return { size: data.sizeOriginal };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/appwrite.ts apps/backend/test/upload-hardening.test.ts
git commit -m "feat(backend): add getAppwriteFileMeta to Appwrite service"
```

---

### Task 3: Physical verification in `/upload/complete`

**Files:**
- Modify: `apps/backend/src/routes/upload.ts`
- Modify: `apps/backend/test/upload-hardening.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `upload-hardening.test.ts`:

```typescript
describe('POST /upload/complete — physical verification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUpload).mockResolvedValue(pendingR2Record);
  });

  it('returns 409 and fails the upload when R2 object is not found', async () => {
    vi.mocked(headObject).mockResolvedValue(null);
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, usrc_d1: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Conflict');
    expect(body.message).toContain('not found');
    expect(vi.mocked(failUpload)).toHaveBeenCalledWith(expect.anything(), 'upload-123');
  });

  it('returns 409 when R2 file size does not match expected', async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 512 }); // expected 1024
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, usrc_d1: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { message: string };
    expect(body.message).toContain('size mismatch');
  });

  it('completes successfully when R2 object exists with correct size', async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 1024 });
    vi.mocked(completeUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, usrc_d1: mockD1() }
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: FAIL — no physical verification exists yet (requests succeed without checking R2).

- [ ] **Step 3: Add verification to `/complete` in `upload.ts`**

Add imports at top of `apps/backend/src/routes/upload.ts`:

```typescript
import { headObject } from '../services/r2';
import { getAppwriteFileMeta, extractAppwriteFileIdFromStorageKey } from '../services/appwrite';
```

In the `/complete` handler, insert this block **after the expiry check** (after line ~244 `return c.json(..., 410)`) and **before** `const updated = await completeUpload(...)`:

```typescript
  // Verify the file physically exists in storage with the correct size
  let physicalSize: number | null = null;
  if (record.destination === 'r2') {
    const svcConfig = getServiceConfig(record.service_id)!;
    const meta = await headObject(c.env, svcConfig.bucketName, record.storage_key);
    physicalSize = meta?.size ?? null;
  } else {
    const fileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
    if (fileId) {
      const meta = await getAppwriteFileMeta(c.env, record.bucket, fileId);
      physicalSize = meta?.size ?? null;
    }
  }

  if (physicalSize === null || physicalSize !== record.size) {
    const failed = await failUpload(c.env.usrc_d1, upload_id);
    if (failed) {
      await releaseQuota(c.env.usrc_d1, record.service_id, record.size, record.user_id);
    }
    return c.json(
      {
        error: 'Conflict',
        message: physicalSize === null ? 'File not found in storage' : 'File size mismatch',
      },
      409
    );
  }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: All tests in the "physical verification" describe block PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/upload-hardening.test.ts
git commit -m "feat(backend): verify physical file existence and size in /upload/complete"
```

---

### Task 4: Rate limit `/public/:slug/unlock`

**Files:**
- Modify: `apps/backend/src/routes/public.ts`
- Modify: `apps/backend/test/upload-hardening.test.ts`

The `publicRouter` currently uses `type HonoEnv = { Bindings: CloudflareBindings }` without `Variables`. The `rateLimitMiddleware` is typed with `Variables: WorkerVariables`. Adding `Variables: WorkerVariables` to `HonoEnv` is safe because the public routes never call `c.get('userId')` etc. — they just won't be set at runtime.

- [ ] **Step 1: Write the failing test**

Add to `upload-hardening.test.ts`:

```typescript
describe('POST /public/:slug/unlock — rate limiting', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    const rateLimitedEnv = {
      ...baseEnv,
      RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) },
    } as unknown as CloudflareBindings;

    const app = buildPublicApp();
    const res = await app.fetch(
      new Request('http://localhost/public/any-slug/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'brute-force-attempt' }),
      }),
      rateLimitedEnv
    );

    expect(res.status).toBe(429);
  });

  it('proceeds past rate limiter when limit is not exceeded', async () => {
    const passEnv = {
      ...baseEnv,
      RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    } as unknown as CloudflareBindings;

    // DB returns no share link → 404, but the point is we got past the rate limiter
    const app = buildPublicApp();
    const res = await app.fetch(
      new Request('http://localhost/public/nonexistent/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test' }),
      }),
      { ...passEnv, usrc_d1: mockD1(0) }
    );

    expect(res.status).not.toBe(429);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: FAIL — the unlock endpoint returns 404 (DB mock), not 429, when rate limit fails.

- [ ] **Step 3: Update `public.ts`**

Add import at top of `apps/backend/src/routes/public.ts`:

```typescript
import { rateLimitMiddleware } from '../middleware/ratelimit';
```

Change the `HonoEnv` type:

```typescript
type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };
```

Add `rateLimitMiddleware` as the first middleware on the unlock route (before `zValidator` calls):

```typescript
publicRouter.post(
  '/:slug/unlock',
  rateLimitMiddleware,
  zValidator('param', slugParam, validationErrorHook),
  zValidator('json', z.object({ password: z.string().min(1) }), validationErrorHook),
  async (c) => {
    // ... existing handler unchanged
  }
);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/upload-hardening.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full backend test suite to check for regressions**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/public.ts apps/backend/test/upload-hardening.test.ts
git commit -m "feat(backend): rate-limit /public/:slug/unlock against brute-force"
```
