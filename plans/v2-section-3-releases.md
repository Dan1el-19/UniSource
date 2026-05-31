# V2 Migration Section 3 — `releases.ts` + `UnisourceV2Client.releases.*` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` with `superpowers:test-driven-development` to implement this plan task-by-task. Inline sequential execution only; do not use parallel subagents because backend response shapes, SDK schemas, route tests, and docs all share one evolving contract. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend `apps/backend/src/routes/releases.ts` is migrated in-place to V2 envelopes and errors, and `UnisourceV2Client.releases.*` covers all 14 release endpoints including single upload, multipart upload, list/get/latest/update/delete, and sync.

**Architecture:** Migrate backend first, then SDK. Reuse the completed Section 2 upload contract for multipart response shapes: single-resource actions return `{ item }`, list-parts returns `{ items, page }`, release listing returns `{ items, page }`, and `sync` returns V2 bulk-style `{ processed, failed[] }`. Keep `/releases/*` as the in-place prefix and keep `GET /app/releases/latest` as the app-facing download endpoint; `client.releases.latest()` remains the admin/manage latest-release metadata endpoint at `/releases/latest`.

**Tech Stack:** TypeScript, Hono 4, Zod 4, Cloudflare Workers, D1, R2, `@cloudflare/vitest-pool-workers`, Vitest, pnpm workspaces, tsdown, changesets.

**Spec sources:** `V2_MIGRATION_PLAN.md` §Sekcja 3, `V2_MIGRATION.md`, `api-v2-architecture.md` §4/§6/§7/§8/§10, and Section 2 upload implementation (`apps/backend/src/routes/upload.ts`, `packages/unisource-sdk/src/v2/upload-schemas.ts`, `packages/unisource-sdk/src/v2/resources/upload.ts`).

---

## Architecture Decisions

1. **`releases.sync` stays in V2.** It is admin-only reconciliation/import for release manifests that already exist in R2. V2 changes its response to bulk-style `{ processed: string[], failed: [{ id, code, message }] }` instead of `{ synced, results }`.
2. **`releases.latest` stays in `client.releases.latest()`.** It maps to `GET /releases/latest` and returns admin/manage release metadata. `client.app.latestRelease()` remains the app-facing endpoint backed by `GET /app/releases/latest`, which includes a presigned download URL and optional channel query.
3. **Multipart releases reuse Section 2 shapes.** Create/sign/list/complete/abort mirror upload V2 response envelopes, with release-specific request fields (`name`, `filename`, `mime_type`, `tags`, `notes`, `force_update`).
4. **`POST /releases/upload/fail` stays.** The master plan scopes 14 release handlers and requires full parity. Unlike Section 2 upload, release upload does not reserve per-user quota and the current fail endpoint is a simple pending-to-failed release lifecycle transition.
5. **No changes to legacy `UnisourceClient`.** `packages/unisource-sdk/src/releases.ts` and `packages/unisource-sdk/src/client.ts` remain frozen for legacy. New V2 release schemas live under `packages/unisource-sdk/src/v2/`.
6. **No new error codes.** Use existing V2 codes: `validation_error`, `not_found`, `conflict`, `bad_gateway`, `cursor_invalid`, and `internal_error`.
7. **Admin-only semantics remain.** `/releases/*` stays behind `authMiddleware`, `rateLimit('general')`, and `requireAdminMiddleware` from `apps/backend/src/index.ts`.

---

## File Structure

### Backend

**Modify:**
- `apps/backend/src/routes/releases.ts` — V2Error, `v2ValidationHook`, `logV2Request`, `{ item }`/`{ items, page }` envelopes, bulk-style sync, no custom `validationErrorHook`.
- `apps/backend/src/db/releases.ts` — stricter cursor parsing for `listReleases`.
- `apps/backend/test/releases-routes.test.ts` — update all route tests to V2 envelopes and `V2Error` error envelope.
- `apps/backend/test/releases.test.ts` — add invalid cursor coverage for `listReleases`.

**Create:**
- `apps/backend/test/integration/v2-releases-end-to-end.test.ts` — SDK-to-backend smoke test for single release upload, multipart release upload, list/latest/get/update/delete, and sync.

### SDK

**Create:**
- `packages/unisource-sdk/src/v2/release-schemas.ts` — V2 release DTO, request schemas, response schemas, sync bulk schema.
- `packages/unisource-sdk/src/v2/resources/releases.ts` — `createReleasesResource(request)` with 14 methods.
- `packages/unisource-sdk/src/v2/__tests__/release-schemas.test.ts` — schema tests.
- `packages/unisource-sdk/src/v2/__tests__/releases.test.ts` — resource URL/body/parser tests.

**Modify:**
- `packages/unisource-sdk/src/v2/client.ts` — mount `readonly releases`.
- `packages/unisource-sdk/src/v2/index.ts` — export V2 release schemas and types.

### Release/Docs

**Create:**
- `.changeset/v2-section-3-releases.md` — minor bump for `@unisource/sdk`.

**Modify:**
- `V2_MIGRATION.md` — backend progress `68/100` to `82/100`, SDK progress `57 methods / 12 resources` to `71 methods / 13 resources`, move `releases.ts` to migrated, remove releases from missing SDK list, leave only `superadmin.ts` as remaining legacy backend.

---

## Target V2 Release Contract

### Release DTO

Use this V2 release item shape in backend responses and SDK schemas:

```ts
type V2Release = {
  id: string
  service_id: string
  name: string
  size: number
  r2_key: string
  tags: string[]
  notes: string | null
  force_update: boolean
  uploaded_by: string
  upload_status: 'pending' | 'completed' | 'failed'
  created_at: string
}
```

### Endpoint Matrix

| Method | Path | SDK method | Response |
|---|---|---|---|
| `POST` | `/releases/upload/init` | `releases.uploadInit(body)` | `{ item: { release_id, presigned_url, r2_key, expires_at } }` |
| `POST` | `/releases/upload/complete` | `releases.uploadComplete(releaseId, size)` | `{ item: { id, status: 'completed' } }` |
| `POST` | `/releases/upload/fail` | `releases.uploadFail(releaseId)` | `{ item: { id, status: 'failed' } }` |
| `POST` | `/releases/upload/multipart/create` | `releases.multipartCreate(body)` | `{ item: { upload_id, r2_upload_id, key, bucket, expires_at } }` |
| `GET` | `/releases/upload/multipart/sign-part` | `releases.multipartSignPart(uploadId, partNumber)` | `{ item: { url, expires_at } }` |
| `GET` | `/releases/upload/multipart/list-parts` | `releases.multipartListParts(uploadId)` | `{ items, page: { limit: 1000, next_cursor: null } }` |
| `POST` | `/releases/upload/multipart/complete` | `releases.multipartComplete(uploadId, parts)` | `{ item: { id, status: 'completed' } }` |
| `DELETE` | `/releases/upload/multipart/abort` | `releases.multipartAbort(uploadId)` | `{ item: { id, status: 'failed' } }` |
| `GET` | `/releases` | `releases.list(query)` | `{ items: V2Release[], page: { limit, next_cursor } }` |
| `GET` | `/releases/latest` | `releases.latest()` | `{ item: V2Release }` |
| `GET` | `/releases/:id` | `releases.get(id)` | `{ item: V2Release }` |
| `PATCH` | `/releases/:id` | `releases.update(id, body)` | `{ item: V2Release }` |
| `DELETE` | `/releases/:id` | `releases.delete(id)` | `{ item: { id, deleted: true } }` |
| `POST` | `/releases/sync` | `releases.sync(body)` | `{ processed: string[], failed: [{ id, code, message }] }` |

---

## Task 1: SDK V2 Release Schemas

**Files:**
- Create: `packages/unisource-sdk/src/v2/release-schemas.ts`
- Create: `packages/unisource-sdk/src/v2/__tests__/release-schemas.test.ts`

- [ ] **Step 1: Write failing schema tests** in `packages/unisource-sdk/src/v2/__tests__/release-schemas.test.ts`.

```ts
import { describe, it, expect } from 'vitest'
import {
  v2ReleaseSchema,
  v2ReleaseListResponseSchema,
  v2ReleaseUploadInitResponseSchema,
  v2ReleaseLifecycleResponseSchema,
  v2ReleaseMultipartCreateResponseSchema,
  v2ReleaseMultipartListPartsResponseSchema,
  v2ReleaseSyncResponseSchema,
} from '../release-schemas'

const release = {
  id: 'rel-1',
  service_id: 'svc-1',
  name: 'v1.2.3',
  size: 4096,
  r2_key: 'releases/svc-1/app.zip',
  tags: ['stable'],
  notes: null,
  force_update: false,
  uploaded_by: 'system',
  upload_status: 'completed' as const,
  created_at: '2026-05-29T00:00:00.000Z',
}

describe('v2 release schemas', () => {
  it('parses a release item', () => {
    expect(v2ReleaseSchema.parse(release).id).toBe('rel-1')
  })

  it('parses list response with V2 page envelope', () => {
    const parsed = v2ReleaseListResponseSchema.parse({
      items: [release],
      page: { limit: 25, next_cursor: null },
    })
    expect(parsed.items).toHaveLength(1)
    expect(parsed.page.limit).toBe(25)
  })

  it('parses single upload init response with item envelope', () => {
    const parsed = v2ReleaseUploadInitResponseSchema.parse({
      item: {
        release_id: 'rel-1',
        presigned_url: 'https://r2.example.com/put',
        r2_key: 'releases/svc-1/app.zip',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.release_id).toBe('rel-1')
  })

  it('parses release lifecycle response', () => {
    const parsed = v2ReleaseLifecycleResponseSchema.parse({
      item: { id: 'rel-1', status: 'completed' },
    })
    expect(parsed.item.status).toBe('completed')
  })

  it('parses multipart create response', () => {
    const parsed = v2ReleaseMultipartCreateResponseSchema.parse({
      item: {
        upload_id: 'rel-1',
        r2_upload_id: 'r2-up-1',
        key: 'releases/svc-1/app.zip',
        bucket: 'primary',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.r2_upload_id).toBe('r2-up-1')
  })

  it('parses multipart list-parts V2 envelope', () => {
    const parsed = v2ReleaseMultipartListPartsResponseSchema.parse({
      items: [{ PartNumber: 1, ETag: 'etag-1', Size: 5242880 }],
      page: { limit: 1000, next_cursor: null },
    })
    expect(parsed.items[0].PartNumber).toBe(1)
  })

  it('parses sync bulk-style response', () => {
    const parsed = v2ReleaseSyncResponseSchema.parse({
      processed: ['rel-1'],
      failed: [{ id: 'bad-key', code: 'validation_error', message: 'r2_key must start with releases/svc-1/' }],
    })
    expect(parsed.processed).toEqual(['rel-1'])
    expect(parsed.failed[0].code).toBe('validation_error')
  })
})
```

- [ ] **Step 2: Run the failing test.**

Run: `pnpm --filter @unisource/sdk test src/v2/__tests__/release-schemas.test.ts`

Expected: FAIL with module resolution error for `../release-schemas`.

- [ ] **Step 3: Implement `packages/unisource-sdk/src/v2/release-schemas.ts`.**

```ts
import { z } from 'zod'
import { v2PageSchema } from './schemas'
import { v2BulkFailureSchema } from './bulk-schemas'

const nonEmptyString = z.string().trim().min(1)
const positiveInt = z.number().int().positive()
const nonNegativeInt = z.number().int().nonnegative()
const releaseId = z.string().trim().min(1).max(128)
const releaseName = z.string().trim().min(1).max(256)
const filename = z.string().trim().min(1).max(255)
const tags = z.array(z.string().trim().min(1).max(64)).max(32)
const notes = z.string().trim().max(10_000).nullable().optional()

export const v2ReleaseSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  name: nonEmptyString,
  size: nonNegativeInt,
  r2_key: nonEmptyString,
  tags: z.array(nonEmptyString),
  notes: z.string().nullable(),
  force_update: z.boolean(),
  uploaded_by: nonEmptyString,
  upload_status: z.enum(['pending', 'completed', 'failed']),
  created_at: nonEmptyString,
})
export type V2Release = z.infer<typeof v2ReleaseSchema>

export const v2ReleaseListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: nonEmptyString.optional(),
})
export type V2ReleaseListQuery = z.input<typeof v2ReleaseListQuerySchema>

export const v2ReleaseListResponseSchema = z.object({
  items: z.array(v2ReleaseSchema),
  page: v2PageSchema,
})
export type V2ReleaseListResponse = z.infer<typeof v2ReleaseListResponseSchema>

export const v2ReleaseResourceResponseSchema = z.object({ item: v2ReleaseSchema })
export type V2ReleaseResourceResponse = z.infer<typeof v2ReleaseResourceResponseSchema>

export const v2ReleaseUploadInitRequestSchema = z.object({
  name: releaseName,
  filename,
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseUploadInitRequest = z.input<typeof v2ReleaseUploadInitRequestSchema>

export const v2ReleaseUploadInitResponseSchema = z.object({
  item: z.object({
    release_id: nonEmptyString,
    presigned_url: z.string().url(),
    r2_key: nonEmptyString,
    expires_at: positiveInt,
  }),
})
export type V2ReleaseUploadInitResponse = z.infer<typeof v2ReleaseUploadInitResponseSchema>

export const v2ReleaseUploadCompleteRequestSchema = z.object({
  release_id: releaseId,
  size: nonNegativeInt,
})
export type V2ReleaseUploadCompleteRequest = z.input<typeof v2ReleaseUploadCompleteRequestSchema>

export const v2ReleaseLifecycleResponseSchema = z.object({
  item: z.object({
    id: nonEmptyString,
    status: z.enum(['completed', 'failed']),
  }),
})
export type V2ReleaseLifecycleResponse = z.infer<typeof v2ReleaseLifecycleResponseSchema>

export const v2ReleaseMultipartCreateRequestSchema = z.object({
  name: releaseName,
  filename,
  mime_type: nonEmptyString.optional().default('application/octet-stream'),
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseMultipartCreateRequest = z.input<typeof v2ReleaseMultipartCreateRequestSchema>

export const v2ReleaseMultipartCreateResponseSchema = z.object({
  item: z.object({
    upload_id: nonEmptyString,
    r2_upload_id: nonEmptyString,
    key: nonEmptyString,
    bucket: nonEmptyString,
    expires_at: positiveInt,
  }),
})
export type V2ReleaseMultipartCreateResponse = z.infer<typeof v2ReleaseMultipartCreateResponseSchema>

export const v2ReleaseMultipartSignPartQuerySchema = z.object({
  upload_id: releaseId,
  part_number: z.coerce.number().int().min(1).max(10_000),
})

export const v2ReleaseMultipartSignPartResponseSchema = z.object({
  item: z.object({ url: z.string().url(), expires_at: positiveInt }),
})
export type V2ReleaseMultipartSignPartResponse = z.infer<typeof v2ReleaseMultipartSignPartResponseSchema>

export const v2ReleaseMultipartPartSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: nonEmptyString,
  Size: nonNegativeInt,
})
export type V2ReleaseMultipartPart = z.infer<typeof v2ReleaseMultipartPartSchema>

export const v2ReleaseMultipartListPartsResponseSchema = z.object({
  items: z.array(v2ReleaseMultipartPartSchema),
  page: v2PageSchema,
})
export type V2ReleaseMultipartListPartsResponse = z.infer<typeof v2ReleaseMultipartListPartsResponseSchema>

export const v2ReleaseMultipartCompleteRequestSchema = z.object({
  upload_id: releaseId,
  parts: z.array(z.object({ PartNumber: z.number().int().min(1).max(10_000), ETag: nonEmptyString })).min(1),
})
export type V2ReleaseMultipartCompleteRequest = z.input<typeof v2ReleaseMultipartCompleteRequestSchema>

export const v2ReleaseMultipartAbortRequestSchema = z.object({ upload_id: releaseId })

export const v2ReleaseUpdateRequestSchema = z
  .object({
    name: releaseName.optional(),
    tags: tags.optional(),
    notes,
    force_update: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  })
export type V2ReleaseUpdateRequest = z.input<typeof v2ReleaseUpdateRequestSchema>

export const v2ReleaseDeleteResponseSchema = z.object({ item: z.object({ id: nonEmptyString, deleted: z.literal(true) }) })
export type V2ReleaseDeleteResponse = z.infer<typeof v2ReleaseDeleteResponseSchema>

export const v2ReleaseSyncManifestSchema = z.object({
  id: releaseId.optional(),
  name: releaseName,
  r2_key: z.string().trim().min(1).max(1024),
  size: nonNegativeInt,
  tags: tags.optional().default([]),
  notes,
  force_update: z.boolean().optional().default(false),
})
export type V2ReleaseSyncManifest = z.input<typeof v2ReleaseSyncManifestSchema>

export const v2ReleaseSyncRequestSchema = z.object({
  releases: z.array(v2ReleaseSyncManifestSchema).min(1).max(100),
})
export type V2ReleaseSyncRequest = z.input<typeof v2ReleaseSyncRequestSchema>

export const v2ReleaseSyncResponseSchema = z.object({
  processed: z.array(nonEmptyString),
  failed: z.array(v2BulkFailureSchema),
})
export type V2ReleaseSyncResponse = z.infer<typeof v2ReleaseSyncResponseSchema>
```

- [ ] **Step 4: Run the schema test.**

Run: `pnpm --filter @unisource/sdk test src/v2/__tests__/release-schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add packages/unisource-sdk/src/v2/release-schemas.ts packages/unisource-sdk/src/v2/__tests__/release-schemas.test.ts
git commit -m "feat(sdk): add V2 release schemas"
```

---

## Task 2: Backend DB Cursor Hardening

**Files:**
- Modify: `apps/backend/src/db/releases.ts`
- Modify: `apps/backend/test/releases.test.ts`

- [ ] **Step 1: Add failing tests** to `apps/backend/test/releases.test.ts` inside `describe('listReleases', ...)`.

```ts
it('throws Invalid cursor for malformed cursor', async () => {
  const db = mockDbReturning([baseRelease])
  await expect(listReleases(db, 'default', { limit: 25, cursor: 'not-a-valid-cursor' })).rejects.toThrow('Invalid cursor')
})

it('throws Invalid cursor for non-numeric cursor timestamp', async () => {
  const db = mockDbReturning([baseRelease])
  await expect(listReleases(db, 'default', { limit: 25, cursor: 'abc:rel-1' })).rejects.toThrow('Invalid cursor')
})
```

- [ ] **Step 2: Run the failing DB test.**

Run: `pnpm --filter backend test apps/backend/test/releases.test.ts`

Expected: FAIL because malformed cursors are currently ignored.

- [ ] **Step 3: Update cursor parsing** in `apps/backend/src/db/releases.ts` inside `listReleases`.

Replace the current `if (input.cursor) { ... }` block with:

```ts
  if (input.cursor) {
    const sep = input.cursor.indexOf(':');
    if (sep <= 0 || sep === input.cursor.length - 1) {
      throw new Error('Invalid cursor');
    }

    const ts = Number(input.cursor.slice(0, sep));
    const cid = input.cursor.slice(sep + 1);
    if (!Number.isFinite(ts) || !cid.trim()) {
      throw new Error('Invalid cursor');
    }

    cursorClause = 'AND (created_at < ? OR (created_at = ? AND id < ?))';
    binds.push(ts, ts, cid);
  }
```

- [ ] **Step 4: Run DB tests.**

Run: `pnpm --filter backend test apps/backend/test/releases.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/backend/src/db/releases.ts apps/backend/test/releases.test.ts
git commit -m "fix(backend): reject invalid release cursors"
```

---

## Task 3: Backend Release Route V2 Foundation

**Files:**
- Modify: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/test/releases-routes.test.ts`

- [ ] **Step 1: Update test harness** in `apps/backend/test/releases-routes.test.ts` so V2 errors are observable.

Add imports:

```ts
import { V2Error, errorResponse } from '../src/lib/v2/errors';
```

Update `buildReleasesApp()` middleware to also set `serviceId` and `requestId`:

```ts
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('requestId', 'req-test' as WorkerVariables['requestId']);
```

Add onError before `return app`:

```ts
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err);
    throw err;
  });
```

- [ ] **Step 2: Add failing validation-error assertion** to `POST /releases/upload/init` missing-name test.

```ts
const body = await res.json() as { error: { code: string; request_id: string } };
expect(body.error.code).toBe('validation_error');
expect(body.error.request_id).toBe('req-test');
```

- [ ] **Step 3: Run focused route test.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: FAIL because `releases.ts` still uses custom `validationErrorHook` and legacy error shape.

- [ ] **Step 4: Update imports and remove custom validation hook** in `apps/backend/src/routes/releases.ts`.

Add imports:

```ts
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';
```

Delete `function validationErrorHook(...)` entirely.

Replace all `zValidator(..., validationErrorHook)` usages with `zValidator(..., v2ValidationHook)`.

- [ ] **Step 5: Run route test again.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: Still FAIL on legacy success/error response assertions. That is expected; later tasks migrate endpoints.

- [ ] **Step 6: Commit foundation only after TypeScript passes.**

Run: `pnpm --filter backend typecheck`

Expected: PASS. If typecheck fails from `releases.ts`, fix before commit.

```bash
git add apps/backend/src/routes/releases.ts apps/backend/test/releases-routes.test.ts
git commit -m "refactor(backend): switch releases route to V2 validation hook"
```

---

## Task 4: Migrate Single Release Upload Lifecycle

**Files:**
- Modify: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/test/releases-routes.test.ts`

- [ ] **Step 1: Update tests for `POST /releases/upload/init`.**

Change response assertions to:

```ts
const body = await res.json() as { item: { presigned_url: string; release_id: string; r2_key: string; expires_at: number } };
expect(body.item.presigned_url).toBe('https://r2.example.com/put');
expect(body.item.r2_key).toBe('releases/default/app.zip');
```

Change `createRelease` assertion ID to `body.item.release_id`.

- [ ] **Step 2: Update tests for `POST /releases/upload/complete`.**

For success assertions use:

```ts
const body = await res.json() as { item: { id: string; status: string } };
expect(body.item).toEqual({ id: 'rel-1', status: 'completed' });
```

For 404/409 assertions use:

```ts
const body = await res.json() as { error: { code: string; message: string } };
expect(body.error.code).toBe('not_found');
```

and conflict cases expect `body.error.code` to be `conflict`.

- [ ] **Step 3: Update tests for `POST /releases/upload/fail`.**

Success shape:

```ts
const body = await res.json() as { item: { id: string; status: string } };
expect(body.item).toEqual({ id: 'rel-1', status: 'failed' });
```

Completed-state conflict shape:

```ts
const body = await res.json() as { error: { code: string; message: string } };
expect(body.error.code).toBe('conflict');
expect(body.error.message).toBe('Release is already in state: completed');
```

- [ ] **Step 4: Run route tests and verify failure.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: FAIL because route still returns legacy flat shapes.

- [ ] **Step 5: Migrate `/upload/init` handler** in `apps/backend/src/routes/releases.ts`.

Inside handler add `const start = Date.now();` before reading state. Return:

```ts
const response = c.json(
  {
    item: {
      release_id: release.id,
      presigned_url,
      r2_key: r2Key,
      expires_at,
    },
  },
  201
);
logV2Request(c, start, { route_family: 'releases', operation: 'upload_init' });
return response;
```

- [ ] **Step 6: Migrate `/upload/complete` errors and response.**

Replace legacy `return c.json({ error: ... })` paths with:

```ts
throw new V2Error('not_found', 404, 'Release not found');
throw new V2Error('conflict', 409, 'Release object not found in storage');
throw new V2Error('conflict', 409, 'Release object size mismatch');
throw new V2Error('conflict', 409, 'Release could not be completed - it may have been cancelled');
```

Return success as:

```ts
const response = c.json({ item: { id: release_id, status: 'completed' as const } });
logV2Request(c, start, { route_family: 'releases', operation: 'upload_complete' });
return response;
```

- [ ] **Step 7: Migrate `/upload/fail` errors and response.**

Use `V2Error('not_found', 404, 'Release not found')` and `V2Error('conflict', 409, ...)` for failure paths. Return success as:

```ts
const response = c.json({ item: { id: release_id, status: 'failed' as const } });
logV2Request(c, start, { route_family: 'releases', operation: 'upload_fail' });
return response;
```

- [ ] **Step 8: Run route tests.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: PASS for single upload lifecycle tests; later sections may still fail for unmigrated endpoints.

- [ ] **Step 9: Commit.**

```bash
git add apps/backend/src/routes/releases.ts apps/backend/test/releases-routes.test.ts
git commit -m "refactor(backend): migrate release upload lifecycle to V2"
```

---

## Task 5: Migrate Release Multipart Lifecycle

**Files:**
- Modify: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/test/releases-routes.test.ts`

- [ ] **Step 1: Extend R2 mocks** in `apps/backend/test/releases-routes.test.ts` mock factory.

Add mocked exports:

```ts
createMultipartUpload: vi.fn().mockResolvedValue({ upload_id: 'r2-upload-id' }),
signUploadPart: vi.fn().mockResolvedValue({ url: 'https://r2.example.com/part-1', expires_at: 9999999999 }),
listUploadedParts: vi.fn().mockResolvedValue([{ PartNumber: 1, ETag: 'etag-1', Size: 1024 }]),
completeMultipartUpload: vi.fn().mockResolvedValue({ etag: 'complete-etag' }),
abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
```

Import them from `../src/services/r2` and mock `createMultipartRelease`, `getReleaseMultipartContext` from `../src/db/releases`.

- [ ] **Step 2: Add or update multipart tests** for all five multipart endpoints.

Required assertions:

```ts
expect((await createRes.json() as { item: { upload_id: string; r2_upload_id: string } }).item.r2_upload_id).toBe('r2-upload-id');
expect((await signRes.json() as { item: { url: string } }).item.url).toBe('https://r2.example.com/part-1');
expect((await listRes.json() as { items: unknown[]; page: { limit: number; next_cursor: string | null } }).page).toEqual({ limit: 1000, next_cursor: null });
expect((await completeRes.json() as { item: { id: string; status: string } }).item.status).toBe('completed');
expect((await abortRes.json() as { item: { id: string; status: string } }).item.status).toBe('failed');
```

- [ ] **Step 3: Run focused tests and verify failure.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: FAIL on legacy multipart shapes.

- [ ] **Step 4: Migrate multipart create** in `releases.ts`.

Use `V2Error('bad_gateway', 502, 'Failed to start multipart upload')` when R2 create fails. Return:

```ts
const response = c.json(
  {
    item: {
      upload_id: releaseId,
      r2_upload_id: r2UploadId,
      key: r2Key,
      bucket: service.default_bucket,
      expires_at,
    },
  },
  201
);
logV2Request(c, start, { route_family: 'releases', operation: 'multipart_create' });
return response;
```

- [ ] **Step 5: Migrate multipart sign/list/complete/abort** using Section 2 upload shapes.

Use these response snippets:

```ts
// sign-part
const response = c.json({ item: { url: signed.url, expires_at: signed.expires_at } });

// list-parts
const response = c.json({
  items: parts,
  page: { limit: 1000, next_cursor: null as string | null },
});

// complete
const response = c.json({ item: { id: upload_id, status: 'completed' as const } });

// abort
const response = c.json({ item: { id: upload_id, status: 'failed' as const } });
```

Map not-found multipart context to `new V2Error('not_found', 404, 'Release upload not found')`. Map wrong state to `new V2Error('conflict', 409, ...)`. Map R2 complete failure to `new V2Error('conflict', 409, 'Failed to complete multipart upload')`.

- [ ] **Step 6: Run route tests.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: PASS for upload and multipart sections; non-upload route assertions may still fail until Task 6.

- [ ] **Step 7: Commit.**

```bash
git add apps/backend/src/routes/releases.ts apps/backend/test/releases-routes.test.ts
git commit -m "refactor(backend): migrate release multipart endpoints to V2"
```

---

## Task 6: Migrate Release CRUD, List, Latest, and Sync

**Files:**
- Modify: `apps/backend/src/routes/releases.ts`
- Modify: `apps/backend/test/releases-routes.test.ts`

- [ ] **Step 1: Update list/latest/get/update/delete tests to V2 shapes.**

Use these assertions:

```ts
// list
const listBody = await res.json() as { items: unknown[]; page: { limit: number; next_cursor: string | null } };
expect(listBody.items).toEqual([]);
expect(listBody.page).toEqual({ limit: 25, next_cursor: null });

// latest/get/update
const itemBody = await res.json() as { item: { id: string } };
expect(itemBody.item.id).toBe('rel-1');

// delete
const deleteBody = await res.json() as { item: { id: string; deleted: true } };
expect(deleteBody.item).toEqual({ id: 'rel-1', deleted: true });
```

- [ ] **Step 2: Update sync tests to bulk-style response.**

For success:

```ts
const body = await res.json() as { processed: string[]; failed: unknown[] };
expect(body.processed).toEqual(['rel-sync']);
expect(body.failed).toEqual([]);
```

For invalid prefix, expect HTTP 200 with per-item failure and no upsert:

```ts
expect(res.status).toBe(200);
const body = await res.json() as { processed: string[]; failed: Array<{ id: string; code: string; message: string }> };
expect(body.processed).toEqual([]);
expect(body.failed[0]).toEqual({
  id: 'rel-sync',
  code: 'validation_error',
  message: 'r2_key must start with releases/default/',
});
```

- [ ] **Step 3: Run route tests and verify failure.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: FAIL on legacy response shapes.

- [ ] **Step 4: Migrate list/latest/get/update/delete handlers.**

Use these snippets:

```ts
// GET /releases
const response = c.json({
  items: result.items,
  page: { limit: query.limit, next_cursor: result.next_cursor },
});

// not found
throw new V2Error('not_found', 404, 'Release not found');

// GET /latest and GET /:id and PATCH /:id
const response = c.json({ item: releaseOrUpdated });

// DELETE /:id
const response = c.json({ item: { id: releaseId, deleted: true as const } });
```

Wrap list cursor errors:

```ts
try {
  const result = await listReleases(...);
  return response;
} catch (err) {
  if (err instanceof Error && err.message === 'Invalid cursor') {
    throw new V2Error('cursor_invalid', 400, 'cursor is invalid');
  }
  throw err;
}
```

- [ ] **Step 5: Migrate sync handler to per-item processing.**

Use local arrays:

```ts
const processed: string[] = [];
const failed: Array<{ id: string; code: 'validation_error' | 'internal_error'; message: string }> = [];
```

For each manifest, compute `releaseId = manifest.id ?? crypto.randomUUID()`. Validate prefix and suffix per manifest. If invalid, push failure and continue. If valid, call `upsertReleaseSync`, `completeRelease`, then push `releaseId` into `processed`. If upsert/complete throws unexpectedly, push `{ id: releaseId, code: 'internal_error', message: 'Release sync failed' }` and continue.

Return:

```ts
const response = c.json({ processed, failed });
logV2Request(c, start, { route_family: 'releases', operation: 'sync' });
return response;
```

- [ ] **Step 6: Run route tests.**

Run: `pnpm --filter backend test apps/backend/test/releases-routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Confirm no custom validation hook remains.**

Run: `rg "validationErrorHook" apps/backend/src/routes/releases.ts`

Expected: No matches.

- [ ] **Step 8: Commit.**

```bash
git add apps/backend/src/routes/releases.ts apps/backend/test/releases-routes.test.ts
git commit -m "refactor(backend): migrate release management endpoints to V2"
```

---

## Task 7: SDK V2 Releases Resource

**Files:**
- Create: `packages/unisource-sdk/src/v2/resources/releases.ts`
- Create: `packages/unisource-sdk/src/v2/__tests__/releases.test.ts`
- Modify: `packages/unisource-sdk/src/v2/client.ts`
- Modify: `packages/unisource-sdk/src/v2/index.ts`

- [ ] **Step 1: Write failing SDK resource tests** in `packages/unisource-sdk/src/v2/__tests__/releases.test.ts`.

```ts
import { describe, it, expect, vi } from 'vitest'
import { createReleasesResource } from '../resources/releases'
import type { V2Request } from '../transport'

function fakeRequest(): { call: ReturnType<typeof vi.fn>; request: V2Request } {
  const call = vi.fn()
  const request: V2Request = ((method, path, options) => {
    call(method, path, options)
    return Promise.resolve(undefined) as never
  }) as V2Request
  return { call, request }
}

describe('releases resource', () => {
  it('uploadInit posts to /releases/upload/init', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).uploadInit({ name: 'v1', filename: 'app.zip' }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/releases/upload/init', expect.objectContaining({ body: expect.objectContaining({ name: 'v1' }) }))
  })

  it('multipartSignPart issues GET with upload_id and part_number', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).multipartSignPart('rel-1', 3).catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/releases/upload/multipart/sign-part', expect.objectContaining({ query: { upload_id: 'rel-1', part_number: 3 } }))
  })

  it('list issues GET /releases', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).list({ limit: 10 }).catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/releases', expect.objectContaining({ query: { limit: 10 } }))
  })

  it('delete issues DELETE /releases/:id', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).delete('rel 1').catch(() => {})
    expect(call).toHaveBeenCalledWith('DELETE', '/releases/rel%201', expect.any(Object))
  })

  it('sync posts to /releases/sync', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).sync({ releases: [{ name: 'v1', r2_key: 'releases/svc/app.zip', size: 1 }] }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/releases/sync', expect.any(Object))
  })
})
```

- [ ] **Step 2: Run failing SDK resource test.**

Run: `pnpm --filter @unisource/sdk test src/v2/__tests__/releases.test.ts`

Expected: FAIL because resource module does not exist.

- [ ] **Step 3: Implement resource** in `packages/unisource-sdk/src/v2/resources/releases.ts`.

Include all 14 methods and parsers from `release-schemas.ts`. Method signatures:

```ts
uploadInit(body, signal?, options?)
uploadComplete(releaseId, size, signal?, options?)
uploadFail(releaseId, signal?, options?)
multipartCreate(body, signal?, options?)
multipartSignPart(uploadId, partNumber, signal?, options?)
multipartListParts(uploadId, signal?, options?)
multipartComplete(uploadId, parts, signal?, options?)
multipartAbort(uploadId, signal?, options?)
list(query?, signal?, options?)
latest(signal?, options?)
get(id, signal?, options?)
update(id, body, signal?, options?)
delete(id, signal?, options?)
sync(body, signal?, options?)
```

Use `encodeURIComponent(id)` for path params and `asUser: options?.asUser` in every request.

- [ ] **Step 4: Mount resource** in `packages/unisource-sdk/src/v2/client.ts`.

Add import:

```ts
import { createReleasesResource } from './resources/releases'
```

Add class field:

```ts
readonly releases: ReturnType<typeof createReleasesResource>
```

Add constructor mount:

```ts
this.releases = createReleasesResource(request)
```

- [ ] **Step 5: Export schemas and types** from `packages/unisource-sdk/src/v2/index.ts`.

Add:

```ts
export {
  v2ReleaseSchema,
  v2ReleaseListQuerySchema,
  v2ReleaseListResponseSchema,
  v2ReleaseResourceResponseSchema,
  v2ReleaseUploadInitRequestSchema,
  v2ReleaseUploadInitResponseSchema,
  v2ReleaseUploadCompleteRequestSchema,
  v2ReleaseLifecycleResponseSchema,
  v2ReleaseMultipartCreateRequestSchema,
  v2ReleaseMultipartCreateResponseSchema,
  v2ReleaseMultipartSignPartQuerySchema,
  v2ReleaseMultipartSignPartResponseSchema,
  v2ReleaseMultipartListPartsResponseSchema,
  v2ReleaseMultipartCompleteRequestSchema,
  v2ReleaseMultipartAbortRequestSchema,
  v2ReleaseUpdateRequestSchema,
  v2ReleaseDeleteResponseSchema,
  v2ReleaseSyncManifestSchema,
  v2ReleaseSyncRequestSchema,
  v2ReleaseSyncResponseSchema,
} from './release-schemas'
export type {
  V2Release,
  V2ReleaseListQuery,
  V2ReleaseListResponse,
  V2ReleaseResourceResponse,
  V2ReleaseUploadInitRequest,
  V2ReleaseUploadInitResponse,
  V2ReleaseUploadCompleteRequest,
  V2ReleaseLifecycleResponse,
  V2ReleaseMultipartCreateRequest,
  V2ReleaseMultipartCreateResponse,
  V2ReleaseMultipartSignPartResponse,
  V2ReleaseMultipartPart,
  V2ReleaseMultipartListPartsResponse,
  V2ReleaseMultipartCompleteRequest,
  V2ReleaseUpdateRequest,
  V2ReleaseDeleteResponse,
  V2ReleaseSyncManifest,
  V2ReleaseSyncRequest,
  V2ReleaseSyncResponse,
} from './release-schemas'
```

- [ ] **Step 6: Run SDK tests.**

Run: `pnpm --filter @unisource/sdk test src/v2/__tests__/release-schemas.test.ts src/v2/__tests__/releases.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/unisource-sdk/src/v2/resources/releases.ts packages/unisource-sdk/src/v2/__tests__/releases.test.ts packages/unisource-sdk/src/v2/client.ts packages/unisource-sdk/src/v2/index.ts
git commit -m "feat(sdk): add V2 releases resource"
```

---

## Task 8: SDK-to-Backend Release Integration Test

**Files:**
- Create: `apps/backend/test/integration/v2-releases-end-to-end.test.ts`

- [ ] **Step 1: Create integration test** by following `apps/backend/test/integration/v2-upload-end-to-end.test.ts` fetch-swap pattern.

The test must:
- import `UnisourceV2Client` from `@unisource/sdk/v2`
- build a Hono app with `/releases` route mounted
- set `userId`, `serviceId`, `authType`, `isAdmin`, `service`, and `requestId`
- mock R2 functions (`generatePresignedPutUrl`, `headObject`, `createMultipartUpload`, `signUploadPart`, `listUploadedParts`, `completeMultipartUpload`, `abortMultipartUpload`, `deleteObject`)
- apply D1 migrations in `beforeAll`
- clear `releases` and insert `services` in `beforeEach`

- [ ] **Step 2: Cover single upload flow.**

Use SDK calls:

```ts
const init = await client.releases.uploadInit({ name: 'v1.0.0', filename: 'app.zip', tags: ['stable'] })
expect(init.item.release_id).toMatch(/^[0-9a-f-]{36}$/)
const completed = await client.releases.uploadComplete(init.item.release_id, 1024)
expect(completed.item.status).toBe('completed')
```

- [ ] **Step 3: Cover multipart flow.**

Use SDK calls:

```ts
const created = await client.releases.multipartCreate({ name: 'v2.0.0', filename: 'big.zip', mime_type: 'application/zip' })
const signed = await client.releases.multipartSignPart(created.item.upload_id, 1)
expect(signed.item.url).toMatch(/^https:\/\//)
const completed = await client.releases.multipartComplete(created.item.upload_id, [{ PartNumber: 1, ETag: 'etag-1' }])
expect(completed.item.status).toBe('completed')
```

- [ ] **Step 4: Cover management and sync flow.**

Use SDK calls:

```ts
const listed = await client.releases.list({ limit: 10 })
expect(listed.page.limit).toBe(10)
const latest = await client.releases.latest()
expect(latest.item.upload_status).toBe('completed')
const fetched = await client.releases.get(latest.item.id)
expect(fetched.item.id).toBe(latest.item.id)
const updated = await client.releases.update(latest.item.id, { notes: 'patched' })
expect(updated.item.notes).toBe('patched')
const synced = await client.releases.sync({ releases: [{ id: 'rel-sync', name: 'v3.0.0', r2_key: 'releases/svc-int/rel-sync.zip', size: 2048 }] })
expect(synced.processed).toEqual(['rel-sync'])
const deleted = await client.releases.delete(latest.item.id)
expect(deleted.item.deleted).toBe(true)
```

- [ ] **Step 5: Run integration test.**

Run: `pnpm --filter backend test apps/backend/test/integration/v2-releases-end-to-end.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/backend/test/integration/v2-releases-end-to-end.test.ts
git commit -m "test(backend,sdk): add V2 releases end-to-end integration test"
```

---

## Task 9: Changeset and Migration Docs

**Files:**
- Create: `.changeset/v2-section-3-releases.md`
- Modify: `V2_MIGRATION.md`

- [ ] **Step 1: Create changeset** `.changeset/v2-section-3-releases.md`.

```md
---
'@unisource/sdk': minor
---

Add `UnisourceV2Client.releases.*` with full V2 release upload, multipart, management, and sync coverage.
```

- [ ] **Step 2: Update `V2_MIGRATION.md`.**

Required edits:
- line 3 status: mention Section 3 releases completed.
- TL;DR backend progress: `~82% (82/100 handlerów)` and next: `Zmigrować superadmin.ts`.
- TL;DR SDK V2 progress: `~91% pokrycia (71 metod / 13 zasobów)`.
- moved `releases.ts` into migrated table with `14` handlers.
- remaining legacy table contains only `superadmin.ts` with `18` handlers.
- `UnisourceV2Client` resources table adds `releases` with `14` methods and endpoint summary `/releases*`.
- missing V2 SDK list removes `releases.*`, leaving no public SDK resource missing after section 3.
- remaining work order removes section 3, leaving `superadmin.ts` and cleanup items.
- definition checkbox for public SDK coverage becomes `[x]` because `superadmin` is internal and does not need SDK.

- [ ] **Step 3: Run documentation sanity grep.**

Run: `rg "releases\.\*|releases\.ts|68/100|57 metod|validationErrorHook" V2_MIGRATION.md apps/backend/src/routes/releases.ts`

Expected:
- `V2_MIGRATION.md` no longer says `releases.*` is missing.
- `V2_MIGRATION.md` no longer says `68/100` as current backend progress.
- `apps/backend/src/routes/releases.ts` has no `validationErrorHook` matches.

- [ ] **Step 4: Commit docs and changeset.**

```bash
git add .changeset/v2-section-3-releases.md V2_MIGRATION.md
git commit -m "docs(root): update V2 migration status for releases"
```

---

## Task 10: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Backend tests.**

Run: `pnpm --filter backend test`

Expected: PASS.

- [ ] **Step 2: SDK build.**

Run: `pnpm --filter @unisource/sdk build`

Expected: PASS.

- [ ] **Step 3: SDK tests.**

Run: `pnpm --filter @unisource/sdk test`

Expected: PASS.

- [ ] **Step 4: Absence checks.**

Run: `rg "validationErrorHook" apps/backend/src/routes/releases.ts`

Expected: no matches.

Run: `git diff --name-only -- packages/unisource-sdk/src/client.ts packages/unisource-sdk/src/releases.ts`

Expected: no output. Legacy `UnisourceClient` files must remain unchanged.

- [ ] **Step 5: Final self-review.**

Check:
- all 14 endpoint matrix rows have route test coverage or integration coverage.
- SDK `client.releases` is mounted and exported from `@unisource/sdk/v2`.
- `sync` invalid manifest does not abort valid manifests.
- no raw storage bucket/key is exposed through error messages.
- `GET /app/releases/latest` was not changed.

---

## Definition of Done

- [ ] Backend `releases.ts` has all 14 handlers migrated to V2 envelopes and `V2Error`.
- [ ] Backend tests for `releases.ts` pass.
- [ ] SDK `UnisourceV2Client.releases.*` exposes 14 methods and tests pass.
- [ ] SDK-to-backend release integration test passes.
- [ ] `pnpm --filter backend test` passes.
- [ ] `pnpm --filter @unisource/sdk build` passes.
- [ ] `pnpm --filter @unisource/sdk test` passes.
- [ ] `.changeset/v2-section-3-releases.md` exists with a minor bump.
- [ ] `V2_MIGRATION.md` reflects `82/100` backend handlers and `71 methods / 13 resources` SDK V2 coverage.
- [ ] `rg "validationErrorHook" apps/backend/src/routes/releases.ts` returns no matches.
