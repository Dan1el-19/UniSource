# V2 Migration Section 2 — `upload.ts` + `UnisourceV2Client.upload.*` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` z `test-driven-development`. Inline sekwencyjnie, jeden agent — NIE używać subagentów (zgodnie z V2_MIGRATION_PLAN.md §Sekcja 2: "to jeden duży, spójny flow z dużą ilością wspólnego stanu — schematy, error codes, request shapes"). Steps używają checkbox (`- [ ]`) syntax do trackingu.

**Goal:** Backend `upload.ts` (8 handlerów po usunięciu `/fail`) zmigrowany do V2 envelope; SDK `UnisourceV2Client.upload.*` dostarczona z 8 metodami pokrywającymi pełny single + multipart flow; nowe error codes `file_too_large` i `quota_exceeded` dodane do allowlisty V2.

**Architecture:** Backend → SDK w jednej sesji. Najpierw fundament (error codes + SDK schemas), potem migracja handlerów po jednym (TDD per handler), potem SDK resource z metodami, na końcu integration test + dokumentacja. Każdy handler dostaje response shape `{ item }` (single resource) lub `{ items, page }` (list-parts), `v2ValidationHook` zamiast własnego helpera, V2Error zamiast inline `c.json({error,message})`.

**Tech Stack:**
- Backend: TypeScript, Hono 4, zod 4, Cloudflare Workers, D1, R2, `@cloudflare/vitest-pool-workers`
- SDK: TypeScript, zod 4, vitest, tsdown
- Monorepo: pnpm workspaces, changesets

**Spec źródłowy:** `V2_MIGRATION_PLAN.md` §Sekcja 2 + `api-v2-architecture.md` §4 (response shapes), §7 (R2 strategy), §8 (observability).

---

## Decyzje architektoniczne (zatwierdzone w brainstormingu)

1. **Lifecycle response shape** = `{ item: UploadRecord }` — V2 single-resource standard.
2. **SDK namespace** = flat (zgodne z `client.public.*`, `client.shareLinks.*`, `client.folders.*`).
3. **`file_too_large` 413** — dziedzinowy code, dodany do `V2_ERROR_CODES` allowlist.
4. **`quota_exceeded` 409** z `details: { scope: 'user' | 'service', requested_bytes }` — dziedzinowy code.
5. **list-parts shape** = `{ items, page: { limit, next_cursor: null } }` — V2 list envelope, synthetic page (R2 zwraca wszystkie parts naraz).
6. **Init shape** = `{ item: UploadInitRecord }` z presigned_url etc. INSIDE.
7. **`upload.fail` REMOVED** — kwota zwalniana przez expiry/Queue cleanup (Queue poza scope sekcji 2). BREAKING wobec `main` (legacy `UnisourceClient.upload.fail` przestanie działać przeciwko `beta`, jak inne legacy contracts już są — V2_MIGRATION.md §4.1).
8. **`multipart.abort` ZOSTAJE** — fizyczna operacja R2 (`abortMultipartUpload`), nie tylko D1 flip; best practice: explicit abort gdy klient anuluje upload.
9. **Method signatures SDK** — `(primaryArg(s), signal?, options?)` per wzór `client.folders.create`.
10. **Different shapes per endpoint, all in `{ item }`** — init zwraca `{ item: UploadInitRecord }`, complete zwraca `{ item: UploadRecord }` z `file_id` po complete.
11. **Schema split**: legacy `packages/unisource-sdk/src/uploads.ts` FROZEN; nowe V2 schemy w `packages/unisource-sdk/src/v2/upload-schemas.ts`.
12. **`mainStorageForbiddenResponse` zamieniany inline** w upload.ts na `throw new V2Error('forbidden', 403, ...)`. Helper jest używany TYLKO w `upload.ts` (sprawdzono).
13. **Prefix `/upload/*` zostaje** — in-place migration (V2_MIGRATION.md §1).
14. **Legacy `UnisourceClient.upload.*` FROZEN** — żadnych zmian. Po sekcji 2 udokumentowane jako known limitation: broken przeciwko `beta` (jak ine legacy contracts).
15. **Bez bulk endpoints** — upload to per-resource lifecycle, nie bulk.
16. **`sign-part` zostaje GET** — typowy S3 SDK pattern.

---

## File Structure — co tworzymy / modyfikujemy

### Backend

**Tworzone:**
- `apps/backend/test/routes/v2/upload.test.ts` — pełne pokrycie testami V2 envelope dla wszystkich 8 endpointów + edge cases (quota, expiry, ownership).

**Modyfikowane:**
- `apps/backend/src/lib/v2/error-codes.ts` — dodaj `file_too_large`, `quota_exceeded` do `V2_ERROR_CODES`.
- `apps/backend/src/routes/upload.ts` — pełen rewrite handlerów (V2 envelope, V2Error, v2ValidationHook, logV2Request, removed `validationErrorHook`, removed `mainStorageForbiddenResponse`, removed `/fail` endpoint).
- `apps/backend/test/upload-hardening.test.ts` — update assertions na V2 envelope (`{ error: { code, message, request_id } }` zamiast `{ error: 'Conflict', message }`).
- `apps/backend/test/service-isolation.test.ts` — usunąć blok "Vuln 2: POST /upload/fail" (linie 194-253), bo endpoint został usunięty. Zastąpić odpowiednikiem dla `/upload/complete` (cross-service isolation).

**Bez zmian (FROZEN):**
- `apps/backend/src/middleware/mainStorageGuard.ts` — `canWriteMainStorage` zostaje, `mainStorageForbiddenResponse` zostaje (bez zmian, ale niewykorzystywany — można usunąć w osobnym refaktorze).

### SDK

**Tworzone:**
- `packages/unisource-sdk/src/v2/upload-schemas.ts` — V2 request/response shapes (init, lifecycle, multipart) wokół zod primitives.
- `packages/unisource-sdk/src/v2/resources/upload.ts` — `createUploadResource(request)` z 8 metodami.
- `packages/unisource-sdk/src/v2/__tests__/upload-schemas.test.ts` — testy parsowania V2 shapes.
- `packages/unisource-sdk/src/v2/__tests__/upload.test.ts` — testy klienta SDK (URL, headers, body serialization).
- `packages/unisource-sdk/src/v2/__tests__/upload-integration.test.ts` — SDK↔backend e2e (mocki R2/Appwrite, real D1).
- `.changeset/v2-section-2-upload.md` — minor bump dla `@unisource/sdk`.

**Modyfikowane:**
- `packages/unisource-sdk/src/v2/error-codes.ts` — dodaj `file_too_large`, `quota_exceeded` do `V2_ERROR_CODES` (mirror backendu).
- `packages/unisource-sdk/src/v2/client.ts` — dodaj `readonly upload: ReturnType<typeof createUploadResource>` + mount.
- `packages/unisource-sdk/src/v2/index.ts` — eksporty publicznych typów.

**Bez zmian (FROZEN):**
- `packages/unisource-sdk/src/uploads.ts` — legacy schemy zostają.
- `packages/unisource-sdk/src/client.ts` — legacy `client.upload.*` zostaje.

### Dokumentacja

**Modyfikowane:**
- `V2_MIGRATION.md` — update liczb handlerów (60→68/100, bo `/fail` removed), sekcja "Zmigrowane" przeniesienie `upload.ts`, "Pozostałe legacy" usunięcie `upload.ts`, dodanie nowych error codes do §`Co to jest standard V2`, dodanie BREAKING note dla legacy `client.upload.fail`.
- `V2_MIGRATION_PLAN.md` — UWAGA: stan po sekcji 2 to 60→68 (nie 60→69 jak zakłada plan), bo usuwamy `/fail`. Zaktualizować kryteria gotowości w sekcji 2.

---

## Spis zadań

### Phase A — Foundation (1 task, sequencyjnie)
1. **Add `file_too_large` + `quota_exceeded`** do allowlisty V2 error codes (backend + SDK + contract test).

### Phase B — SDK V2 schemas (1 task, sequencyjnie)
2. **SDK V2 upload-schemas** — request/response shapes dla wszystkich 8 endpointów.

### Phase C — Backend handler migration (10 tasków, sequencyjnie, TDD per handler)
3. **Migrate `POST /upload/r2/init`** do V2.
4. **Migrate `POST /upload/appwrite/init`** do V2.
5. **Migrate `POST /upload/complete`** do V2.
6. **Remove `POST /upload/fail`** handler + service-isolation test rebase.
7. **Migrate `POST /upload/r2/multipart/create`** do V2.
8. **Migrate `GET /upload/r2/multipart/sign-part`** do V2.
9. **Migrate `GET /upload/r2/multipart/list-parts`** do V2 (z `{ items, page }`).
10. **Migrate `POST /upload/r2/multipart/complete`** do V2.
11. **Migrate `DELETE /upload/r2/multipart/abort`** do V2.
12. **Cleanup `upload.ts`** — usunięcie własnego `validationErrorHook`, importu `mainStorageForbiddenResponse`, weryfikacja braku legacy patternów.

### Phase D — SDK V2 upload resource (3 taski, sequencyjnie)
13. **SDK upload resource** — `createUploadResource(request)` z 8 metodami.
14. **Mount upload w UnisourceV2Client** — `readonly upload`.
15. **Eksporty SDK index** — public types.

### Phase E — Integration testing (1 task)
16. **SDK↔backend integration test** — full single + multipart flow.

### Phase F — Documentation (2 taski)
17. **Changeset SDK** — minor bump.
18. **Update `V2_MIGRATION.md`** — liczby, sekcje, breaking note.

---

## Definicja końca (z V2_MIGRATION_PLAN.md, doprecyzowana)

- [ ] `pnpm --filter backend test` — zielony, wszystkie testy upload.ts pokryte V2 envelope.
- [ ] `pnpm --filter @unisource/sdk build` — zielony.
- [ ] `pnpm --filter @unisource/sdk test` — zielony (schemy + klient + integration).
- [ ] Changeset SDK opublikowany (minor bump).
- [ ] `V2_MIGRATION.md` zaktualizowany: 60→68/100 handlerów (po usunięciu `/fail`), `upload.ts` w "Zmigrowane", nowe error codes w §"Co to jest standard V2", BREAKING note dla `client.upload.fail`.
- [ ] Brak `validationErrorHook` w `upload.ts` (potwierdzone `grep -n "validationErrorHook" apps/backend/src/routes/upload.ts` zwraca pustą listę).
- [ ] Brak `mainStorageForbiddenResponse` importu w `upload.ts`.
- [ ] Backend contract test SDK↔backend error codes nadal zielony (`apps/backend/test/lib/v2/error-codes.contract.test.ts`).
- [ ] `apps/backend/test/service-isolation.test.ts` zielony po rebase (cross-service isolation testowane na `/upload/complete` zamiast `/fail`).

---

<!-- TASK CONTENT BELOW (sekcje pisane osobno) -->

## Phase A — Foundation

### Task 1: Add `file_too_large` + `quota_exceeded` do V2_ERROR_CODES

**Files:**
- Modify: `apps/backend/src/lib/v2/error-codes.ts`
- Modify: `packages/unisource-sdk/src/v2/error-codes.ts`
- Test: `apps/backend/test/lib/v2/error-codes.contract.test.ts` (już istnieje, zostanie automatycznie zwalidowany)

- [ ] **Step 1: Otwórz `apps/backend/src/lib/v2/error-codes.ts`** i dodaj nowe codes do `V2_ERROR_CODES`:

```ts
export const V2_ERROR_CODES = [
  'validation_error',
  'cursor_invalid',
  'search_too_long',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'internal_error',
  'conflict',
  'bad_gateway',
  'gone',
  'file_too_large',
  'quota_exceeded',
] as const

export type V2ErrorCode = typeof V2_ERROR_CODES[number]
```

- [ ] **Step 2: Otwórz `packages/unisource-sdk/src/v2/error-codes.ts`** i dodaj te same codes (mirror musi być identyczny):

```ts
export const V2_ERROR_CODES = [
  'validation_error',
  'cursor_invalid',
  'search_too_long',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'internal_error',
  'conflict',
  'bad_gateway',
  'gone',
  'file_too_large',
  'quota_exceeded',
] as const

export type V2ErrorCode = typeof V2_ERROR_CODES[number]

export function isV2ErrorCode(value: string): value is V2ErrorCode {
  return (V2_ERROR_CODES as readonly string[]).includes(value)
}
```

(Zachowaj istniejący `isV2ErrorCode` helper jeśli jest — sprawdź plik przed edycją.)

- [ ] **Step 3: Uruchom contract test** żeby potwierdzić sync:

```bash
pnpm --filter backend test apps/backend/test/lib/v2/error-codes.contract.test.ts
```

Expected: PASS, contract test sprawdza że obie listy są identyczne.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/v2/error-codes.ts packages/unisource-sdk/src/v2/error-codes.ts
git commit -m "feat(v2): add file_too_large and quota_exceeded to V2_ERROR_CODES allowlist"
```

---

## Phase B — SDK V2 Schemas

### Task 2: SDK V2 upload-schemas

**Files:**
- Create: `packages/unisource-sdk/src/v2/upload-schemas.ts`
- Create: `packages/unisource-sdk/src/v2/__tests__/upload-schemas.test.ts`

- [ ] **Step 1: Utwórz failing test** `packages/unisource-sdk/src/v2/__tests__/upload-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  v2UploadR2InitRequestSchema,
  v2UploadR2InitResponseSchema,
  v2UploadAppwriteInitRequestSchema,
  v2UploadAppwriteInitResponseSchema,
  v2UploadCompleteRequestSchema,
  v2UploadLifecycleResponseSchema,
  v2MultipartCreateRequestSchema,
  v2MultipartCreateResponseSchema,
  v2MultipartSignPartQuerySchema,
  v2MultipartSignPartResponseSchema,
  v2MultipartListPartsResponseSchema,
  v2MultipartCompleteRequestSchema,
  v2MultipartAbortRequestSchema,
} from '../upload-schemas'

describe('v2 upload schemas', () => {
  it('parses R2 init response with { item } envelope', () => {
    const parsed = v2UploadR2InitResponseSchema.parse({
      item: {
        upload_id: 'abc',
        destination: 'r2',
        presigned_url: 'https://example.com/put',
        storage_key: 'svc/2026/01/01/abc.bin',
        bucket: 'unisource-default',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.destination).toBe('r2')
    expect(parsed.item.upload_id).toBe('abc')
  })

  it('parses Appwrite init response with optional jwt', () => {
    const parsed = v2UploadAppwriteInitResponseSchema.parse({
      item: {
        upload_id: 'abc',
        destination: 'appwrite',
        appwrite_endpoint: 'https://appwrite.example.com',
        appwrite_project_id: 'proj',
        appwrite_bucket_id: 'buck',
        file_id: 'file-1',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.jwt).toBeUndefined()
  })

  it('parses lifecycle response with completed status + file_id', () => {
    const parsed = v2UploadLifecycleResponseSchema.parse({
      item: {
        id: 'upload-1',
        status: 'completed',
        upload_type: 'single',
        file_id: 'file-1',
      },
    })
    expect(parsed.item.status).toBe('completed')
    expect(parsed.item.file_id).toBe('file-1')
  })

  it('parses lifecycle response with failed status + null file_id', () => {
    const parsed = v2UploadLifecycleResponseSchema.parse({
      item: { id: 'upload-1', status: 'failed', upload_type: 'multipart', file_id: null },
    })
    expect(parsed.item.status).toBe('failed')
    expect(parsed.item.file_id).toBeNull()
  })

  it('parses multipart create response', () => {
    const parsed = v2MultipartCreateResponseSchema.parse({
      item: {
        upload_id: 'abc',
        r2_upload_id: 'r2-up-1',
        key: 'svc/2026/01/01/abc.bin',
        bucket: 'unisource-default',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.r2_upload_id).toBe('r2-up-1')
  })

  it('parses list-parts response with V2 envelope { items, page }', () => {
    const parsed = v2MultipartListPartsResponseSchema.parse({
      items: [{ PartNumber: 1, ETag: 'etag1', Size: 5242880 }],
      page: { limit: 1000, next_cursor: null },
    })
    expect(parsed.items[0].PartNumber).toBe(1)
    expect(parsed.page.next_cursor).toBeNull()
  })

  it('rejects sign-part query with part_number > 10000', () => {
    expect(() =>
      v2MultipartSignPartQuerySchema.parse({ upload_id: 'abc', part_number: 10001 })
    ).toThrow()
  })

  it('coerces sign-part part_number from string', () => {
    const parsed = v2MultipartSignPartQuerySchema.parse({ upload_id: 'abc', part_number: '5' })
    expect(parsed.part_number).toBe(5)
  })

  it('rejects multipart-complete with empty parts array', () => {
    expect(() =>
      v2MultipartCompleteRequestSchema.parse({ upload_id: 'abc', parts: [] })
    ).toThrow()
  })

  it('accepts multipart-complete with parts', () => {
    const parsed = v2MultipartCompleteRequestSchema.parse({
      upload_id: 'abc',
      parts: [{ PartNumber: 1, ETag: 'etag1' }],
    })
    expect(parsed.parts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test, expect FAIL** (no module yet):

```bash
pnpm --filter @unisource/sdk test src/v2/__tests__/upload-schemas.test.ts
```

Expected: FAIL — "Cannot find module '../upload-schemas'".

- [ ] **Step 3: Utwórz** `packages/unisource-sdk/src/v2/upload-schemas.ts`:

```ts
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)
const positiveInt = z.number().int().positive()

// ─── Init: R2 ────────────────────────────────────────────────────────────────

export const v2UploadR2InitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadR2InitRequest = z.input<typeof v2UploadR2InitRequestSchema>

export const v2UploadR2InitItemSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('r2'),
  presigned_url: z.string().url(),
  storage_key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
})

export const v2UploadR2InitResponseSchema = z.object({
  item: v2UploadR2InitItemSchema,
})
export type V2UploadR2InitResponse = z.infer<typeof v2UploadR2InitResponseSchema>

// ─── Init: Appwrite ──────────────────────────────────────────────────────────

export const v2UploadAppwriteInitRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadAppwriteInitRequest = z.input<typeof v2UploadAppwriteInitRequestSchema>

export const v2UploadAppwriteInitItemSchema = z.object({
  upload_id: nonEmptyString,
  destination: z.literal('appwrite'),
  appwrite_endpoint: z.string().url(),
  appwrite_project_id: nonEmptyString,
  appwrite_bucket_id: nonEmptyString,
  file_id: nonEmptyString,
  expires_at: positiveInt,
  /** Appwrite JWT — present only when caller authenticates with JWT (not API key). */
  jwt: nonEmptyString.optional(),
})

export const v2UploadAppwriteInitResponseSchema = z.object({
  item: v2UploadAppwriteInitItemSchema,
})
export type V2UploadAppwriteInitResponse = z.infer<typeof v2UploadAppwriteInitResponseSchema>

// ─── Lifecycle: complete (single) ────────────────────────────────────────────

export const v2UploadCompleteRequestSchema = z.object({
  upload_id: nonEmptyString,
  is_main_storage: z.boolean().optional().default(false),
})
export type V2UploadCompleteRequest = z.input<typeof v2UploadCompleteRequestSchema>

export const v2UploadLifecycleItemSchema = z.object({
  id: nonEmptyString,
  status: z.enum(['completed', 'failed']),
  upload_type: z.enum(['single', 'multipart']),
  /** New file row id created from the upload — present only after a successful complete. */
  file_id: nonEmptyString.nullable(),
})

export const v2UploadLifecycleResponseSchema = z.object({
  item: v2UploadLifecycleItemSchema,
})
export type V2UploadLifecycleResponse = z.infer<typeof v2UploadLifecycleResponseSchema>

// ─── Multipart: create ───────────────────────────────────────────────────────

export const v2MultipartCreateRequestSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  folder_id: nonEmptyString.optional(),
  is_main_storage: z.boolean().optional().default(false),
})
export type V2MultipartCreateRequest = z.input<typeof v2MultipartCreateRequestSchema>

export const v2MultipartCreateItemSchema = z.object({
  upload_id: nonEmptyString,
  r2_upload_id: nonEmptyString,
  key: nonEmptyString,
  bucket: nonEmptyString,
  expires_at: positiveInt,
})

export const v2MultipartCreateResponseSchema = z.object({
  item: v2MultipartCreateItemSchema,
})
export type V2MultipartCreateResponse = z.infer<typeof v2MultipartCreateResponseSchema>

// ─── Multipart: sign-part ────────────────────────────────────────────────────

export const v2MultipartSignPartQuerySchema = z.object({
  upload_id: nonEmptyString,
  part_number: z.coerce.number().int().min(1).max(10_000),
})
export type V2MultipartSignPartQuery = z.input<typeof v2MultipartSignPartQuerySchema>

export const v2MultipartSignPartItemSchema = z.object({
  url: z.string().url(),
  expires_at: positiveInt,
})

export const v2MultipartSignPartResponseSchema = z.object({
  item: v2MultipartSignPartItemSchema,
})
export type V2MultipartSignPartResponse = z.infer<typeof v2MultipartSignPartResponseSchema>

// ─── Multipart: list-parts (V2 list envelope) ────────────────────────────────

export const v2MultipartPartSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: nonEmptyString,
  Size: z.number().int().nonnegative(),
})
export type V2MultipartPart = z.infer<typeof v2MultipartPartSchema>

export const v2MultipartListPartsResponseSchema = z.object({
  items: z.array(v2MultipartPartSchema),
  page: z.object({
    limit: positiveInt,
    next_cursor: z.string().nullable(),
  }),
})
export type V2MultipartListPartsResponse = z.infer<typeof v2MultipartListPartsResponseSchema>

// ─── Multipart: complete ─────────────────────────────────────────────────────

export const v2MultipartCompleteRequestSchema = z.object({
  upload_id: nonEmptyString,
  parts: z
    .array(z.object({
      PartNumber: z.number().int().min(1).max(10_000),
      ETag: nonEmptyString,
    }))
    .min(1),
})
export type V2MultipartCompleteRequest = z.input<typeof v2MultipartCompleteRequestSchema>

export const v2MultipartCompleteResponseSchema = v2UploadLifecycleResponseSchema
export type V2MultipartCompleteResponse = z.infer<typeof v2MultipartCompleteResponseSchema>

// ─── Multipart: abort ────────────────────────────────────────────────────────

export const v2MultipartAbortRequestSchema = z.object({
  upload_id: nonEmptyString,
})
export type V2MultipartAbortRequest = z.input<typeof v2MultipartAbortRequestSchema>

export const v2MultipartAbortResponseSchema = v2UploadLifecycleResponseSchema
export type V2MultipartAbortResponse = z.infer<typeof v2MultipartAbortResponseSchema>
```

- [ ] **Step 4: Run tests, expect PASS**:

```bash
pnpm --filter @unisource/sdk test src/v2/__tests__/upload-schemas.test.ts
```

Expected: PASS, wszystkie 11 testów zielone.

- [ ] **Step 5: Run SDK build** żeby potwierdzić brak błędów typów:

```bash
pnpm --filter @unisource/sdk build
```

Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add packages/unisource-sdk/src/v2/upload-schemas.ts packages/unisource-sdk/src/v2/__tests__/upload-schemas.test.ts
git commit -m "feat(sdk): add V2 upload schemas with { item } envelope and list-parts { items, page }"
```

---

## Phase C — Backend handler migration (TDD per handler)

**Note for executor:** Każdy handler dostaje failing test → migration → green test → commit. Testy w `apps/backend/test/routes/v2/upload.test.ts` są pisane progresywnie (każdy task dodaje swoje describe block). Po każdym tasku route plik `upload.ts` ma jeden handler już zmigrowany, a ine zachowują stare V1 shape — **to jest OK**, plik będzie hybrydowy aż do Task 12 (cleanup), wtedy własny `validationErrorHook` jest usuwany.

**Setup `upload.test.ts` na początku Phase C** (przed Task 3 — utwórz pusty plik z helpers):

```ts
// apps/backend/test/routes/v2/upload.test.ts
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import upload from '../../../src/routes/upload'
import { v2RequestIdGuard } from '../../../src/lib/v2/log'
import { V2Error, errorResponse } from '../../../src/lib/v2/errors'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

const TEST_TIMEOUT = 15000

// Service + user fixtures
const SERVICE_ID = 'svc-test'
const USER_ID = 'user-test'

// Test app builder — mounts upload sub-app with auth context preset and v2 error handling.
function buildApp(opts?: { userId?: string; serviceRole?: string }) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', (opts?.userId ?? USER_ID) as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set('authType', (opts?.userId === 'system' ? 'apikey' : 'jwt') as WorkerVariables['authType'])
    c.set('serviceRole', (opts?.serviceRole ?? 'user') as WorkerVariables['serviceRole'])
    c.set('service', {
      id: SERVICE_ID,
      default_bucket: 'unisource-default',
      max_file_size_bytes: 100_000_000,
      object_key_prefix: 'svc-test',
    } as any)
    c.set('requestId', 'req-test')
    await next()
  })
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err)
    throw err
  })
  app.route('/upload', upload)
  return app
}

beforeAll(async () => {
  await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.APP_DB.prepare('DELETE FROM uploads').run()
  await env.APP_DB.prepare('DELETE FROM files').run()
  // Service row + quota row (assumed migration exposes these; if not, adjust to seed via raw SQL).
  await env.APP_DB.prepare(`
    INSERT OR REPLACE INTO services (id, default_bucket, max_file_size_bytes, object_key_prefix, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(SERVICE_ID, 'unisource-default', 100_000_000, 'svc-test', 0, 0).run()
})

// Test files appended per-task below.
```

(Executor: jeśli schema seed-u różni się od powyższego, sprawdź `apps/backend/test/routes/v2/files.test.ts` jak poprawnie seedować service + quota row — adaptuj 1:1.)

---

### Task 3: Migrate `POST /upload/r2/init` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:83-170`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests** w `upload.test.ts`:

```ts
describe('POST /upload/r2/init — V2 envelope', () => {
  it('returns { item } envelope with presigned_url + storage_key on success', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { item: { upload_id: string; destination: string; presigned_url: string } }
    expect(body.item.destination).toBe('r2')
    expect(body.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.item.presigned_url).toMatch(/^https:\/\//)
  }, TEST_TIMEOUT)

  it('returns V2 error envelope (validation_error) for invalid body', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: '', size: 'not-a-number' }),
      }),
      env
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string; request_id: string } }
    expect(body.error.code).toBe('validation_error')
    expect(body.error.request_id).toBe('req-test')
  })

  it('returns 413 with file_too_large code when size exceeds service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'huge.bin', size: 999_999_999_999, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(413)
    const body = await res.json() as { error: { code: string; details?: { max_bytes: number } } }
    expect(body.error.code).toBe('file_too_large')
    expect(body.error.details?.max_bytes).toBe(100_000_000)
  })

  it('returns 403 with forbidden code when non-admin requests is_main_storage', async () => {
    const app = buildApp({ serviceRole: 'user' })
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream', is_main_storage: true,
        }),
      }),
      env
    )
    expect(res.status).toBe(403)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('forbidden')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (handler still returns legacy shape):

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

Expected: FAIL — assertions check V2 envelope, route returns `{ error: 'Bad Request', message }` etc.

- [ ] **Step 3: Migrate handler** w `apps/backend/src/routes/upload.ts`. Zastąp BLOK od `upload.post('/r2/init', rateLimit('upload-init'), zValidator('json', uploadR2InitRequestSchema, validationErrorHook), async (c) => {` do końca tego handlera (linie 83-170 obecnego pliku):

```ts
import { V2Error } from '../lib/v2/errors';
import { v2ValidationHook } from '../lib/v2/zodHook';
import { logV2Request } from '../lib/v2/log';
// (te importy będą mapowane do top-of-file w Task 12 cleanup)

upload.post(
  '/r2/init',
  rateLimit('upload-init'),
  zValidator('json', uploadR2InitRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    if (body.is_main_storage === true && !canWriteMainStorage(c)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
      );
    }

    const quotaResult = body.is_main_storage
      ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
      : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
    if (!quotaResult.ok) {
      if (userId !== 'system') {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'quota_exceeded',
            resourceType: 'service',
            resourceId: serviceId,
            metadata: { requested_bytes: size },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
      const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadId = crypto.randomUUID();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const storageKey = buildStorageKey(service.object_key_prefix, getDatePath(), uploadId, ext ?? '');

    const { presigned_url, expires_at } = await generatePresignedPutUrl(
      c.env,
      service.default_bucket,
      storageKey,
      mime_type,
      UPLOAD_TTL_SECONDS
    );

    await createUpload(c.env.APP_DB, {
      id: uploadId,
      service_id: serviceId,
      user_id: userId === 'system' ? null : userId,
      folder_id: folder_id ?? null,
      filename,
      size,
      mime_type,
      destination: 'r2',
      storage_key: storageKey,
      bucket: service.default_bucket,
      presigned_url,
      expires_at,
      is_main_storage: body.is_main_storage === true,
    });

    const response = c.json(
      {
        item: {
          upload_id: uploadId,
          destination: 'r2' as const,
          presigned_url,
          storage_key: storageKey,
          bucket: service.default_bucket,
          expires_at,
        },
      },
      201
    );
    logV2Request(c, start, { route_family: 'upload', operation: 'r2_init' });
    return response;
  }
);
```

(Importy `V2Error`, `v2ValidationHook`, `logV2Request` dodaj na górze pliku jeśli jeszcze ich nie ma. Do pliku NIE WPROWADZAJ jeszcze removal `validationErrorHook` — to robimy w Task 12.)

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

Expected: 4 tests in `POST /upload/r2/init — V2 envelope` zielone.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate POST /upload/r2/init to V2 envelope (file_too_large + quota_exceeded codes)"
```

---

### Task 4: Migrate `POST /upload/appwrite/init` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:175-254`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('POST /upload/appwrite/init — V2 envelope', () => {
  it('returns { item } envelope with appwrite_endpoint + file_id on success', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { item: { destination: string; appwrite_endpoint: string; file_id: string } }
    expect(body.item.destination).toBe('appwrite')
    expect(body.item.appwrite_endpoint).toMatch(/^https:\/\//)
    expect(body.item.file_id).toMatch(/^[0-9a-f-]{36}$/)
  }, TEST_TIMEOUT)

  it('omits jwt field when caller has no appwriteJwt context (api key path)', async () => {
    const app = buildApp({ userId: 'system' })
    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    const body = await res.json() as { item: { jwt?: string } }
    expect(body.item.jwt).toBeUndefined()
  })

  it('returns 413 file_too_large for size exceeding service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'a.bin', size: 999_999_999_999, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(413)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('file_too_large')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (handler still legacy):

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler `/appwrite/init`** — zastąp BLOK linie 175-254 w `upload.ts`:

```ts
upload.post(
  '/appwrite/init',
  rateLimit('upload-init'),
  zValidator('json', uploadAppwriteInitRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    if (body.is_main_storage === true && !canWriteMainStorage(c)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
      );
    }

    const quotaResult = body.is_main_storage
      ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
      : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
    if (!quotaResult.ok) {
      if (userId !== 'system') {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'quota_exceeded',
            resourceType: 'service',
            resourceId: serviceId,
            metadata: { requested_bytes: size },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
      const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    const storageKey = buildAppwriteStorageKey(service.object_key_prefix, getDatePath(), fileId);
    const config = getAppwriteUploadConfig(c.env, fileId, UPLOAD_TTL_SECONDS);

    await createUpload(c.env.APP_DB, {
      id: uploadId,
      service_id: serviceId,
      user_id: userId === 'system' ? null : userId,
      folder_id: folder_id ?? null,
      filename,
      size,
      mime_type,
      destination: 'appwrite',
      storage_key: storageKey,
      bucket: config.bucket_id,
      presigned_url: null,
      expires_at: config.expires_at,
      is_main_storage: body.is_main_storage === true,
    });

    const item = {
      upload_id: uploadId,
      destination: 'appwrite' as const,
      appwrite_endpoint: config.endpoint,
      appwrite_project_id: config.project_id,
      appwrite_bucket_id: config.bucket_id,
      file_id: fileId,
      expires_at: config.expires_at,
      ...(c.get('appwriteJwt') ? { jwt: c.get('appwriteJwt') } : {}),
    };

    const response = c.json({ item }, 201);
    logV2Request(c, start, { route_family: 'upload', operation: 'appwrite_init' });
    return response;
  }
);
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

Expected: 7 tests zielone (4 z Task 3 + 3 z Task 4).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate POST /upload/appwrite/init to V2 envelope"
```

---

### Task 5: Migrate `POST /upload/complete` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:260-383`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('POST /upload/complete — V2 envelope', () => {
  // Tests use mocks for headObject/getAppwriteFileMeta to control physical-verification path.
  // Adapt to existing mock pattern in apps/backend/test/upload-hardening.test.ts.

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'nonexistent' }),
      }),
      env
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 410 gone when upload TTL expired', async () => {
    // Seed an expired upload row.
    const expiredId = 'upload-expired'
    await env.APP_DB.prepare(`
      INSERT INTO uploads (id, service_id, user_id, folder_id, filename, size, mime_type,
        destination, storage_key, bucket, presigned_url, expires_at, status, is_main_storage,
        created_at, updated_at)
      VALUES (?, ?, NULL, NULL, ?, ?, ?, 'r2', ?, 'unisource-default', NULL, ?, 'pending', 0, 0, 0)
    `).bind(expiredId, SERVICE_ID, 'a.bin', 1024, 'application/octet-stream', 'svc-test/key', 1).run()
    // expires_at = 1 → way in the past

    const app = buildApp({ userId: 'system' })
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: expiredId }),
      }),
      env
    )
    expect(res.status).toBe(410)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('gone')
  })

  // NOTE: Remaining tests (success path with mocked headObject, size mismatch, etc.) reuse
  // the mocking style from apps/backend/test/upload-hardening.test.ts. Add them here with
  // assertions targeting V2 envelope:
  //   expect(body.item.status).toBe('completed')
  //   expect(body.item.file_id).toMatch(/uuid/)
  //   expect(body.item.upload_type).toBe('single')
})
```

(Executor: jeśli mockowanie R2/Appwrite okaże się niewykonalne w `vitest-pool-workers` setupie, migracja success-path testów może zostać przeniesiona do `upload-hardening.test.ts` — TAM mocki już działają. W tym przypadku w `upload.test.ts` zostaw tylko testy które nie wymagają mock R2 — `not_found`, `gone`, `validation_error`. Resztę dodaj/zmigruj w `upload-hardening.test.ts` na assertions `body.item.*`.)

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 260-383:

```ts
upload.post(
  '/complete',
  zValidator('json', uploadLifecycleRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id } = body;
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');

    const record = userId === 'system'
      ? await getUpload(c.env.APP_DB, upload_id)
      : await getUploadForUser(c.env.APP_DB, upload_id, userId, serviceId);

    if (!record) {
      throw new V2Error('not_found', 404, 'Upload record not found');
    }

    const isMainStorage = record.is_main_storage === 1;

    if (record.status === 'completed') {
      // Idempotent: return existing state. file_id may be null if completed by anonymous (system, non-main) path.
      const existingFile = await c.env.APP_DB
        .prepare('SELECT id FROM files WHERE upload_id = ? LIMIT 1')
        .bind(upload_id)
        .first<{ id: string }>();
      const response = c.json({
        item: {
          id: upload_id,
          status: 'completed' as const,
          upload_type: (record.upload_type ?? 'single') as 'single' | 'multipart',
          file_id: existingFile?.id ?? null,
        },
      });
      logV2Request(c, start, { route_family: 'upload', operation: 'complete' });
      return response;
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expires_at < now) {
      const updated = await failUpload(c.env.APP_DB, upload_id);
      if (updated) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
      }
      throw new V2Error('gone', 410, 'Upload session has expired');
    }

    let physicalSize: number | null = null;
    if (record.destination === 'r2') {
      const meta = await headObject(c.env, record.bucket, record.storage_key);
      physicalSize = meta?.size ?? null;
    } else {
      const fileId = extractAppwriteFileIdFromStorageKey(record.storage_key);
      if (fileId) {
        const meta = await getAppwriteFileMeta(c.env, record.bucket, fileId);
        physicalSize = meta?.size ?? null;
      }
    }

    if (physicalSize === null || physicalSize !== record.size) {
      const failed = await failUpload(c.env.APP_DB, upload_id);
      if (failed) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
      }
      throw new V2Error(
        'conflict',
        409,
        physicalSize === null ? 'File not found in storage' : 'File size mismatch'
      );
    }

    const newFileId = crypto.randomUUID();
    let createdFileId: string | null = null;

    if (userId !== 'system' || isMainStorage) {
      const promotion = await completeUploadAndCreateFile(c.env.APP_DB, {
        uploadId: upload_id,
        file: {
          id: newFileId,
          service_id: serviceId,
          user_id: userId,
          folder_id: isMainStorage ? null : record.folder_id ?? null,
          upload_id,
          filename: record.filename,
          size: record.size,
          mime_type: record.mime_type,
          storage_destination: record.destination,
          storage_key: record.storage_key,
          bucket: record.bucket,
          is_main_storage: isMainStorage,
        },
      });

      if (!promotion.completed && !promotion.alreadyCompleted) {
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = promotion.completed ? newFileId : null;

      if (userId !== 'system' && promotion.completed) {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
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
    } else {
      const updated = await completeUpload(c.env.APP_DB, upload_id);
      if (!updated) {
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      // Anonymous (system, non-main) path: no file row created.
      createdFileId = null;
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'completed' as const,
        upload_type: (record.upload_type ?? 'single') as 'single' | 'multipart',
        file_id: createdFileId,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'complete' });
    return response;
  }
);
```

- [ ] **Step 4: Update `apps/backend/test/upload-hardening.test.ts`** — assertions które badają legacy shape (np. `body.error === 'Conflict'`, `body.success === true`) zmień na V2 envelope (`body.error.code === 'conflict'`, `body.item.status === 'completed'`, `body.item.file_id === ...`).

Konkretnie zmień:
- linia 204: `expect(body.error).toBe('Conflict')` → `expect(body.error.code).toBe('conflict')`
- linia 205: `expect(body.message).toContain('not found')` → `expect(body.error.message).toContain('not found')`
- linia 224: `expect(body.message).toContain('size mismatch')` → `expect(body.error.message).toContain('size mismatch')`
- linia 243-244: `expect(body.success).toBe(true)` → `expect(body.item.status).toBe('completed')`

Adjusts response type narrowing accordingly (`as { error: { code: string; message: string } }` lub `{ item: { status: string; file_id: string | null } }`).

- [ ] **Step 5: Run all upload tests, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts apps/backend/test/upload-hardening.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts apps/backend/test/upload-hardening.test.ts
git commit -m "refactor(backend): migrate POST /upload/complete to V2 envelope ({ item } with file_id)"
```

---

### Task 6: Remove `POST /upload/fail` handler + service-isolation rebase

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:385-416` (DELETE handler)
- Modify: `apps/backend/test/service-isolation.test.ts:194-253` (DELETE describe block "Vuln 2")

- [ ] **Step 1: Usuń cały handler `/fail`** z `apps/backend/src/routes/upload.ts` (linie 385-416, łącznie z komentarzem nad nim jeśli istnieje).

- [ ] **Step 2: Usuń import `failUpload` JEŚLI nigdzie indziej w pliku nie jest używany** — sprawdź `grep -n "failUpload" apps/backend/src/routes/upload.ts`. Jest używany w `/complete` (expiry path) i multipart endpointach (abort, complete expiry path) — więc **zostaw import**.

- [ ] **Step 3: Usuń blok "Vuln 2: POST /upload/fail — service isolation"** w `apps/backend/test/service-isolation.test.ts:194-253`.

- [ ] **Step 4: Dodaj zastępczy test cross-service isolation dla `/upload/complete`** w tym samym pliku, w miejscu usuniętego bloku:

```ts
// ---------------------------------------------------------------------------
// Vuln 2: POST /upload/complete — cross-service isolation (API key path)
// ---------------------------------------------------------------------------
describe('POST /upload/complete — service isolation', () => {
	it('returns 404 when the upload belongs to a different service (API key / system userId)', async () => {
		const db = mockD1WithRecord(blokPendingRecord);
		const { app, env } = buildUploadApp('default', 'system', db);

		const res = await app.fetch(
			new Request('http://localhost/upload/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ upload_id: 'upload-blok-pending' }),
			}),
			env
		);

		expect(res.status).toBe(404);
		const body = await res.json() as { error: { code: string } };
		expect(body.error.code).toBe('not_found');
	});

	it('returns 404 when the upload belongs to a different service (JWT / user auth)', async () => {
		const blokUserRecord: UploadRecord = {
			...blokPendingRecord,
			service_id: 'service-b',
			user_id: 'user-abc',
		};
		const db = mockD1WithRecord(blokUserRecord);
		const { app, env } = buildUploadApp('default', 'user-abc', db);

		const res = await app.fetch(
			new Request('http://localhost/upload/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ upload_id: 'upload-blok-pending' }),
			}),
			env
		);

		expect(res.status).toBe(404);
	});
});
```

(Executor: oryginalny test sprawdzał `expect(res.status).toBe(200)` dla pozytywnego path-u. Ten case dla `complete` wymaga zamockowania `headObject` etc. — dla minimum cross-service isolation wystarczą dwa testy 404 jak wyżej.)

- [ ] **Step 5: Run service-isolation tests, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/service-isolation.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/service-isolation.test.ts
git commit -m "refactor(backend)!: remove POST /upload/fail (V2 — quota released by expiry/Queue cleanup)"
```

(`!` w typie commit = breaking change; documented w changeset i V2_MIGRATION.md w Tasks 17-18.)

---

### Task 7: Migrate `POST /upload/r2/multipart/create` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:458-564`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('POST /upload/r2/multipart/create — V2 envelope', () => {
  it('returns { item } envelope with r2_upload_id + key on success', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'big.bin', size: 50_000_000, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(201)
    const body = await res.json() as { item: { upload_id: string; r2_upload_id: string; key: string; bucket: string } }
    expect(body.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.item.r2_upload_id).toBeTruthy()
    expect(body.item.key).toContain('svc-test/')
  }, TEST_TIMEOUT)

  it('returns 413 file_too_large when size exceeds service max', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'huge.bin', size: 999_999_999_999, mime_type: 'application/octet-stream' }),
      }),
      env
    )
    expect(res.status).toBe(413)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('file_too_large')
  })
})
```

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 458-564:

```ts
upload.post(
  '/r2/multipart/create',
  rateLimit('upload-init'),
  zValidator('json', multipartCreateRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');
    const service = c.get('service')!;

    if (body.is_main_storage === true && !canWriteMainStorage(c)) {
      throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
    }

    const { filename, size, mime_type, folder_id } = body;

    if (size > service.max_file_size_bytes) {
      throw new V2Error(
        'file_too_large',
        413,
        `File exceeds maximum size of ${service.max_file_size_bytes} bytes`,
        { max_bytes: service.max_file_size_bytes }
      );
    }

    const quotaResult = body.is_main_storage
      ? await reserveMainStorageQuota(c.env.APP_DB, serviceId, size)
      : await reserveQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);

    if (!quotaResult.ok) {
      if (userId !== 'system') {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'quota_exceeded',
            resourceType: 'service',
            resourceId: serviceId,
            metadata: { requested_bytes: size, upload_type: 'multipart' },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
      const scope = 'scope' in quotaResult ? quotaResult.scope : 'service';
      throw new V2Error(
        'quota_exceeded',
        409,
        scope === 'user'
          ? 'Storage quota exceeded for this user'
          : 'Storage quota exceeded for this service',
        { scope, requested_bytes: size }
      );
    }

    const uploadRecordId = crypto.randomUUID();
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const storageKey = buildStorageKey(service.object_key_prefix, getDatePath(), uploadRecordId, ext ?? '');

    let r2UploadId: string;
    try {
      const result = await createMultipartUpload(c.env, service.default_bucket, storageKey, mime_type);
      r2UploadId = result.upload_id;
    } catch (err) {
      if (body.is_main_storage) {
        await releaseMainStorageQuota(c.env.APP_DB, serviceId, size);
      } else {
        await releaseQuota(c.env.APP_DB, serviceId, size, userId === 'system' ? null : userId);
      }
      console.error('[multipart/create] R2 createMultipartUpload failed', err);
      throw new V2Error('bad_gateway', 502, 'Unable to create multipart upload on R2');
    }

    const expires_at = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

    await createUpload(c.env.APP_DB, {
      id: uploadRecordId,
      service_id: serviceId,
      user_id: userId === 'system' ? null : userId,
      folder_id: folder_id ?? null,
      filename,
      size,
      mime_type,
      destination: 'r2',
      storage_key: storageKey,
      bucket: service.default_bucket,
      presigned_url: null,
      expires_at,
      is_main_storage: body.is_main_storage === true,
      upload_type: 'multipart',
      r2_upload_id: r2UploadId,
    });

    const response = c.json(
      {
        item: {
          upload_id: uploadRecordId,
          r2_upload_id: r2UploadId,
          key: storageKey,
          bucket: service.default_bucket,
          expires_at,
        },
      },
      201
    );
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_create' });
    return response;
  }
);
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate POST /upload/r2/multipart/create to V2 envelope"
```

---

### Task 8: Migrate `GET /upload/r2/multipart/sign-part` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:569-606`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('GET /upload/r2/multipart/sign-part — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/sign-part?upload_id=nonexistent&part_number=1', {
        method: 'GET',
      }),
      env
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 400 validation_error when part_number out of range', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/sign-part?upload_id=abc&part_number=99999', {
        method: 'GET',
      }),
      env
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })

  // Success path requires seeded multipart upload + signing — adapt from main-storage.test.ts pattern.
})
```

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 569-606:

```ts
upload.get(
  '/r2/multipart/sign-part',
  zValidator('query', multipartSignPartQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { upload_id, part_number } = c.req.valid('query');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    if (record.status !== 'pending') {
      throw new V2Error('conflict', 409, `Upload is in state: ${record.status}`);
    }

    const signed = await signUploadPart(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!,
      part_number,
      MULTIPART_PART_URL_TTL_SECONDS
    );

    const response = c.json({
      item: {
        url: signed.url,
        expires_at: signed.expires_at,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_sign_part' });
    return response;
  }
);
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate GET /upload/r2/multipart/sign-part to V2 envelope"
```

---

### Task 9: Migrate `GET /upload/r2/multipart/list-parts` do V2 z `{ items, page }`

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:611-639`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('GET /upload/r2/multipart/list-parts — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/list-parts?upload_id=nonexistent', {
        method: 'GET',
      }),
      env
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  // Success path: assert { items, page: { limit, next_cursor: null } } shape.
  // Requires seeded multipart upload — adapt to existing test setup with mocks for listUploadedParts.
})
```

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 611-639:

```ts
const MULTIPART_LIST_PARTS_LIMIT = 1000;

upload.get(
  '/r2/multipart/list-parts',
  zValidator('query', multipartListPartsQuerySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const { upload_id } = c.req.valid('query');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    const parts = await listUploadedParts(
      c.env,
      record.bucket,
      record.storage_key,
      record.r2_upload_id!
    );

    const response = c.json({
      items: parts,
      page: {
        limit: MULTIPART_LIST_PARTS_LIMIT,
        next_cursor: null as string | null,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_list_parts' });
    return response;
  }
);
```

(Const `MULTIPART_LIST_PARTS_LIMIT` można umieścić blisko `MULTIPART_PART_URL_TTL_SECONDS` na górze sekcji multipart.)

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate GET /upload/r2/multipart/list-parts to V2 { items, page } envelope"
```

---

### Task 10: Migrate `POST /upload/r2/multipart/complete` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:644-779`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('POST /upload/r2/multipart/complete — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id: 'nonexistent',
          parts: [{ PartNumber: 1, ETag: 'etag1' }],
        }),
      }),
      env
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  it('returns 400 validation_error for empty parts array', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'abc', parts: [] }),
      }),
      env
    )
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('validation_error')
  })

  // Success path with mocked completeMultipartUpload + headObject — adapt from upload-hardening.test.ts.
})
```

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 644-779:

```ts
upload.post(
  '/r2/multipart/complete',
  zValidator('json', multipartCompleteRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id, parts } = body;
    const serviceId = c.get('serviceId');
    const userId = c.get('userId');

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;

    if (record.status === 'completed') {
      const existingFile = await c.env.APP_DB
        .prepare('SELECT id FROM files WHERE upload_id = ? LIMIT 1')
        .bind(upload_id)
        .first<{ id: string }>();
      const response = c.json({
        item: {
          id: upload_id,
          status: 'completed' as const,
          upload_type: 'multipart' as const,
          file_id: existingFile?.id ?? null,
        },
      });
      logV2Request(c, start, { route_family: 'upload', operation: 'multipart_complete' });
      return response;
    }

    const now = Math.floor(Date.now() / 1000);
    const isMainStorage = record.is_main_storage === 1;

    if (record.expires_at < now) {
      const failed = await failUpload(c.env.APP_DB, upload_id);
      if (failed) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
        await abortMultipartUpload(c.env, record.bucket, record.storage_key, record.r2_upload_id!).catch((err) => {
          console.error('[multipart/complete] abortMultipartUpload after expiry failed', err);
        });
      }
      throw new V2Error('gone', 410, 'Upload session has expired');
    }

    try {
      await completeMultipartUpload(
        c.env,
        record.bucket,
        record.storage_key,
        record.r2_upload_id!,
        parts
      );
    } catch (err) {
      console.error('[multipart/complete] R2 CompleteMultipartUpload failed', err);
      throw new V2Error('conflict', 409, 'Failed to complete multipart upload');
    }

    const meta = await headObject(c.env, record.bucket, record.storage_key);
    if (!meta || meta.size !== record.size) {
      const failed = await failUpload(c.env.APP_DB, upload_id);
      if (failed) {
        if (isMainStorage) {
          await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
        } else {
          await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
        }
      }
      throw new V2Error(
        'conflict',
        409,
        !meta ? 'File not found in storage' : 'File size mismatch'
      );
    }

    const newFileId = crypto.randomUUID();
    let createdFileId: string | null = null;

    if (userId !== 'system' || isMainStorage) {
      const promotion = await completeUploadAndCreateFile(c.env.APP_DB, {
        uploadId: upload_id,
        file: {
          id: newFileId,
          service_id: serviceId,
          user_id: userId,
          folder_id: isMainStorage ? null : record.folder_id ?? null,
          upload_id,
          filename: record.filename,
          size: record.size,
          mime_type: record.mime_type,
          storage_destination: record.destination,
          storage_key: record.storage_key,
          bucket: record.bucket,
          is_main_storage: isMainStorage,
        },
      });

      if (!promotion.completed && !promotion.alreadyCompleted) {
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = promotion.completed ? newFileId : null;

      if (userId !== 'system' && promotion.completed) {
        c.executionCtx.waitUntil(
          logServiceEvent(c.env.APP_DB, {
            serviceId,
            userId,
            action: 'upload_completed',
            resourceType: 'file',
            resourceId: newFileId,
            metadata: {
              filename: record.filename,
              size: record.size,
              is_main_storage: isMainStorage,
              upload_type: 'multipart',
              parts: parts.length,
            },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          })
        );
      }
    } else {
      const updated = await completeUpload(c.env.APP_DB, upload_id);
      if (!updated) {
        throw new V2Error('conflict', 409, 'Upload could not be completed');
      }
      createdFileId = null;
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'completed' as const,
        upload_type: 'multipart' as const,
        file_id: createdFileId,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_complete' });
    return response;
  }
);
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate POST /upload/r2/multipart/complete to V2 envelope ({ item } with file_id)"
```

---

### Task 11: Migrate `DELETE /upload/r2/multipart/abort` do V2

**Files:**
- Modify: `apps/backend/src/routes/upload.ts:784-825`
- Test: `apps/backend/test/routes/v2/upload.test.ts` (append describe block)

- [ ] **Step 1: Append failing tests**:

```ts
describe('DELETE /upload/r2/multipart/abort — V2 envelope', () => {
  it('returns 404 not_found when upload record missing', async () => {
    const app = buildApp()
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/abort', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'nonexistent' }),
      }),
      env
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  // Success path: seed multipart upload, mock abortMultipartUpload — assert
  //   body.item.status === 'failed', body.item.upload_type === 'multipart', body.item.file_id === null
})
```

- [ ] **Step 2: Run, expect FAIL**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 3: Migrate handler** — zastąp BLOK linie 784-825:

```ts
upload.delete(
  '/r2/multipart/abort',
  zValidator('json', multipartAbortRequestSchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const body = c.req.valid('json');
    const { upload_id } = body;

    const result = await getOwnedMultipartUpload(c, upload_id);
    if ('error' in result) {
      if (result.error === 'not_found') {
        throw new V2Error('not_found', 404, 'Upload record not found');
      }
      throw new V2Error('conflict', 409, 'Upload is not a multipart R2 upload');
    }

    const { record } = result;
    const isMainStorage = record.is_main_storage === 1;

    if (record.status !== 'pending') {
      throw new V2Error('conflict', 409, `Upload is already in state: ${record.status}`);
    }

    await abortMultipartUpload(c.env, record.bucket, record.storage_key, record.r2_upload_id!).catch((err) => {
      console.error('[multipart/abort] abortMultipartUpload failed', err);
    });

    const updated = await failUpload(c.env.APP_DB, upload_id);
    if (updated) {
      if (isMainStorage) {
        await releaseMainStorageQuota(c.env.APP_DB, record.service_id, record.size);
      } else {
        await releaseQuota(c.env.APP_DB, record.service_id, record.size, record.user_id);
      }
    }

    const response = c.json({
      item: {
        id: upload_id,
        status: 'failed' as const,
        upload_type: 'multipart' as const,
        file_id: null,
      },
    });
    logV2Request(c, start, { route_family: 'upload', operation: 'multipart_abort' });
    return response;
  }
);
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter backend test apps/backend/test/routes/v2/upload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/upload.ts apps/backend/test/routes/v2/upload.test.ts
git commit -m "refactor(backend): migrate DELETE /upload/r2/multipart/abort to V2 envelope"
```

---

### Task 12: Cleanup `upload.ts` — usunięcie własnego helpera + niewykorzystywanych importów

**Files:**
- Modify: `apps/backend/src/routes/upload.ts` (top-of-file imports + helper deletion)

- [ ] **Step 1: Usuń definicję `validationErrorHook`** (linie 43-70 obecnego pliku, funkcja od `function validationErrorHook(...)` do zamykającego `}`).

- [ ] **Step 2: Usuń import `mainStorageForbiddenResponse`** z importu `'../middleware/mainStorageGuard'`. Zostaw `canWriteMainStorage`. Nowy import po edycji:

```ts
import { canWriteMainStorage } from '../middleware/mainStorageGuard';
```

- [ ] **Step 3: Sprawdź że top-of-file zawiera nowe V2 imports** (jeśli były dodawane inline w poprzednich tasków, scal w jeden blok):

```ts
import { V2Error } from '../lib/v2/errors';
import { v2ValidationHook } from '../lib/v2/zodHook';
import { logV2Request } from '../lib/v2/log';
```

- [ ] **Step 4: Weryfikacja, brak `validationErrorHook` w pliku**:

```bash
grep -n "validationErrorHook" apps/backend/src/routes/upload.ts
```

Expected: pusta lista (no matches).

- [ ] **Step 5: Weryfikacja, brak `mainStorageForbiddenResponse`**:

```bash
grep -n "mainStorageForbiddenResponse" apps/backend/src/routes/upload.ts
```

Expected: pusta lista.

- [ ] **Step 6: Run all backend tests**:

```bash
pnpm --filter backend test
```

Expected: cały suite zielony (włącznie z `upload.test.ts`, `upload-hardening.test.ts`, `service-isolation.test.ts`, `error-codes.contract.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/routes/upload.ts
git commit -m "chore(backend): remove legacy validationErrorHook + mainStorageForbiddenResponse usage from upload.ts"
```

---

## Phase D — SDK V2 upload resource

### Task 13: Create `createUploadResource(request)` — 8 metod SDK

**Files:**
- Create: `packages/unisource-sdk/src/v2/resources/upload.ts`
- Create: `packages/unisource-sdk/src/v2/__tests__/upload.test.ts`

- [ ] **Step 1: Utwórz failing test** `packages/unisource-sdk/src/v2/__tests__/upload.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createUploadResource } from '../resources/upload'
import type { V2Request } from '../transport'

function fakeRequest(): { call: ReturnType<typeof vi.fn>; request: V2Request } {
  const call = vi.fn(async () => ({}))
  const request: V2Request = (method, path, options) => {
    call(method, path, options)
    return Promise.resolve(options.parser.parse({})) as any
  }
  return { call, request }
}

describe('upload resource', () => {
  it('r2Init posts to /upload/r2/init', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.r2Init({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/r2/init', expect.objectContaining({
      body: expect.objectContaining({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }),
    }))
  })

  it('appwriteInit posts to /upload/appwrite/init', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.appwriteInit({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/appwrite/init', expect.any(Object))
  })

  it('complete posts to /upload/complete with upload_id in body', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.complete('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/complete', expect.objectContaining({
      body: { upload_id: 'upload-1' },
    }))
  })

  it('multipartCreate posts to /upload/r2/multipart/create', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartCreate({ filename: 'big.bin', size: 5_000_000, mime_type: 'application/octet-stream' }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/r2/multipart/create', expect.any(Object))
  })

  it('multipartSignPart issues GET with upload_id + part_number in query', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartSignPart('upload-1', 5).catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/upload/r2/multipart/sign-part', expect.objectContaining({
      query: { upload_id: 'upload-1', part_number: 5 },
    }))
  })

  it('multipartListParts issues GET with upload_id in query', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartListParts('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/upload/r2/multipart/list-parts', expect.objectContaining({
      query: { upload_id: 'upload-1' },
    }))
  })

  it('multipartComplete posts to /upload/r2/multipart/complete with parts', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartComplete('upload-1', [{ PartNumber: 1, ETag: 'etag1' }]).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/r2/multipart/complete', expect.objectContaining({
      body: { upload_id: 'upload-1', parts: [{ PartNumber: 1, ETag: 'etag1' }] },
    }))
  })

  it('multipartAbort issues DELETE with upload_id in body', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartAbort('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith('DELETE', '/upload/r2/multipart/abort', expect.objectContaining({
      body: { upload_id: 'upload-1' },
    }))
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (no module yet):

```bash
pnpm --filter @unisource/sdk test src/v2/__tests__/upload.test.ts
```

Expected: FAIL — "Cannot find module '../resources/upload'".

- [ ] **Step 3: Utwórz** `packages/unisource-sdk/src/v2/resources/upload.ts`:

```ts
import type { V2Request } from '../transport'
import {
  v2UploadR2InitRequestSchema,
  v2UploadR2InitResponseSchema,
  v2UploadAppwriteInitRequestSchema,
  v2UploadAppwriteInitResponseSchema,
  v2UploadCompleteRequestSchema,
  v2UploadLifecycleResponseSchema,
  v2MultipartCreateRequestSchema,
  v2MultipartCreateResponseSchema,
  v2MultipartSignPartQuerySchema,
  v2MultipartSignPartResponseSchema,
  v2MultipartListPartsResponseSchema,
  v2MultipartCompleteRequestSchema,
  v2MultipartAbortRequestSchema,
  type V2UploadR2InitRequest,
  type V2UploadR2InitResponse,
  type V2UploadAppwriteInitRequest,
  type V2UploadAppwriteInitResponse,
  type V2UploadLifecycleResponse,
  type V2MultipartCreateRequest,
  type V2MultipartCreateResponse,
  type V2MultipartSignPartResponse,
  type V2MultipartListPartsResponse,
} from '../upload-schemas'

interface CallOptions {
  asUser?: string
}

export function createUploadResource(request: V2Request) {
  return {
    r2Init: (
      body: V2UploadR2InitRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadR2InitResponse> =>
      request('POST', '/upload/r2/init', {
        body: v2UploadR2InitRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2UploadR2InitResponseSchema,
      }),

    appwriteInit: (
      body: V2UploadAppwriteInitRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadAppwriteInitResponse> =>
      request('POST', '/upload/appwrite/init', {
        body: v2UploadAppwriteInitRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2UploadAppwriteInitResponseSchema,
      }),

    complete: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions & { isMainStorage?: boolean }
    ): Promise<V2UploadLifecycleResponse> =>
      request('POST', '/upload/complete', {
        body: v2UploadCompleteRequestSchema.parse({
          upload_id: uploadId,
          ...(options?.isMainStorage ? { is_main_storage: true } : {}),
        }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),

    multipartCreate: (
      body: V2MultipartCreateRequest,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartCreateResponse> =>
      request('POST', '/upload/r2/multipart/create', {
        body: v2MultipartCreateRequestSchema.parse(body),
        signal,
        asUser: options?.asUser,
        parser: v2MultipartCreateResponseSchema,
      }),

    multipartSignPart: (
      uploadId: string,
      partNumber: number,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartSignPartResponse> =>
      request('GET', '/upload/r2/multipart/sign-part', {
        query: v2MultipartSignPartQuerySchema.parse({ upload_id: uploadId, part_number: partNumber }),
        signal,
        asUser: options?.asUser,
        parser: v2MultipartSignPartResponseSchema,
      }),

    multipartListParts: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2MultipartListPartsResponse> =>
      request('GET', '/upload/r2/multipart/list-parts', {
        query: { upload_id: uploadId },
        signal,
        asUser: options?.asUser,
        parser: v2MultipartListPartsResponseSchema,
      }),

    multipartComplete: (
      uploadId: string,
      parts: Array<{ PartNumber: number; ETag: string }>,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadLifecycleResponse> =>
      request('POST', '/upload/r2/multipart/complete', {
        body: v2MultipartCompleteRequestSchema.parse({ upload_id: uploadId, parts }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),

    multipartAbort: (
      uploadId: string,
      signal?: AbortSignal,
      options?: CallOptions
    ): Promise<V2UploadLifecycleResponse> =>
      request('DELETE', '/upload/r2/multipart/abort', {
        body: v2MultipartAbortRequestSchema.parse({ upload_id: uploadId }),
        signal,
        asUser: options?.asUser,
        parser: v2UploadLifecycleResponseSchema,
      }),
  }
}
```

- [ ] **Step 4: Run, expect PASS**:

```bash
pnpm --filter @unisource/sdk test src/v2/__tests__/upload.test.ts
```

Expected: 8 tests zielone.

- [ ] **Step 5: Commit**

```bash
git add packages/unisource-sdk/src/v2/resources/upload.ts packages/unisource-sdk/src/v2/__tests__/upload.test.ts
git commit -m "feat(sdk): add V2 upload resource with 8 methods (r2Init, appwriteInit, complete, multipart*)"
```

---

### Task 14: Mount `upload` w `UnisourceV2Client`

**Files:**
- Modify: `packages/unisource-sdk/src/v2/client.ts`

- [ ] **Step 1: Otwórz `client.ts`** i zmodyfikuj 3 miejsca:

A) Add import na górze:
```ts
import { createUploadResource } from './resources/upload'
```

B) Add field declaration w klasie `UnisourceV2Client`:
```ts
readonly upload: ReturnType<typeof createUploadResource>
```

C) Add mount w constructorze (po `this.public = ...`):
```ts
this.upload = createUploadResource(request)
```

Po edycji odpowiednia sekcja klasy wygląda tak (kopia z istniejącego pliku z dodaną linijką):

```ts
export class UnisourceV2Client {
  readonly files: ReturnType<typeof createFilesResource>
  readonly shares: ReturnType<typeof createSharesResource>
  readonly app: ReturnType<typeof createAppResource>
  readonly shareLinks: ReturnType<typeof createShareLinksResource>
  readonly folders: ReturnType<typeof createFoldersResource>
  readonly mainStorage: ReturnType<typeof createMainStorageResource>
  readonly myFiles: ReturnType<typeof createMyFilesResource>
  readonly userFiles: ReturnType<typeof createUserFilesResource>
  readonly admin: ReturnType<typeof createAdminResource>
  readonly public: ReturnType<typeof createPublicResource>
  readonly upload: ReturnType<typeof createUploadResource>

  constructor(config: UnisourceV2ClientConfig) {
    // ... existing validation + warn ...
    const request = createV2Request(config)
    this.files = createFilesResource(request)
    this.shares = createSharesResource(request)
    this.app = createAppResource(request)
    this.shareLinks = createShareLinksResource(request)
    this.folders = createFoldersResource(request)
    this.mainStorage = createMainStorageResource(request)
    this.myFiles = createMyFilesResource(request)
    this.userFiles = createUserFilesResource(request)
    this.admin = createAdminResource(request)
    this.public = createPublicResource(request, config.baseUrl)
    this.upload = createUploadResource(request)
  }
}
```

- [ ] **Step 2: Run SDK build**:

```bash
pnpm --filter @unisource/sdk build
```

Expected: clean build, brak błędów typów.

- [ ] **Step 3: Run pełny suite SDK**:

```bash
pnpm --filter @unisource/sdk test
```

Expected: wszystko zielone.

- [ ] **Step 4: Commit**

```bash
git add packages/unisource-sdk/src/v2/client.ts
git commit -m "feat(sdk): mount upload resource on UnisourceV2Client"
```

---

### Task 15: Public type exports w SDK index

**Files:**
- Modify: `packages/unisource-sdk/src/v2/index.ts`

- [ ] **Step 1: Otwórz `packages/unisource-sdk/src/v2/index.ts`** i dodaj eksporty z `upload-schemas.ts`. Sprawdź pierwszy istniejący file pattern (np. `export type { ... } from './folders-schemas'`) i dopasuj. Dodaj:

```ts
export type {
  V2UploadR2InitRequest,
  V2UploadR2InitResponse,
  V2UploadAppwriteInitRequest,
  V2UploadAppwriteInitResponse,
  V2UploadCompleteRequest,
  V2UploadLifecycleResponse,
  V2MultipartCreateRequest,
  V2MultipartCreateResponse,
  V2MultipartSignPartQuery,
  V2MultipartSignPartResponse,
  V2MultipartListPartsResponse,
  V2MultipartPart,
  V2MultipartCompleteRequest,
  V2MultipartCompleteResponse,
  V2MultipartAbortRequest,
  V2MultipartAbortResponse,
} from './upload-schemas'
```

- [ ] **Step 2: Run build**:

```bash
pnpm --filter @unisource/sdk build
```

Expected: clean build, public types dostępne dla konsumentów.

- [ ] **Step 3: Verify dist**:

```bash
grep -l "V2UploadR2InitResponse" packages/unisource-sdk/dist/*.d.ts
```

Expected: typy widoczne w `dist/v2/index.d.ts` lub bundlu typów.

- [ ] **Step 4: Commit**

```bash
git add packages/unisource-sdk/src/v2/index.ts
git commit -m "feat(sdk): export V2 upload types from /v2 entry"
```

---

## Phase E — Integration testing

### Task 16: SDK↔backend integration test (full single + multipart flow)

**Files:**
- Create: `packages/unisource-sdk/src/v2/__tests__/upload-integration.test.ts` (jeśli SDK ma już pattern dla integration testów; sprawdź `packages/unisource-sdk/src/v2/__tests__/` — jeśli inne integration testy istnieją, naśladuj. Jeśli nie, integration test może iść do `apps/backend/test/integration/`.)

- [ ] **Step 1: Sprawdź istniejące pattern**:

```bash
ls packages/unisource-sdk/src/v2/__tests__/
ls apps/backend/test/integration/
```

Wybierz lokalizację zgodną z istniejącymi integration testami (najprawdopodobniej `apps/backend/test/integration/v2-upload-end-to-end.test.ts` na wzór `v2-files-end-to-end.test.ts`).

- [ ] **Step 2: Utwórz test pliku** (lokalizacja: `apps/backend/test/integration/v2-upload-end-to-end.test.ts`):

```ts
/**
 * SDK ↔ Backend integration: full single upload flow + full multipart flow.
 * Mocks R2 storage primitives (headObject, generatePresignedPutUrl, createMultipartUpload,
 * etc.) but exercises real D1 + real V2 envelope + real SDK parsing.
 */
import { Hono } from 'hono'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { applyD1Migrations, env } from 'cloudflare:test'
import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { UnisourceV2Client } from '@unisource/sdk/v2'
import upload from '../../src/routes/upload'
import { V2Error, errorResponse } from '../../src/lib/v2/errors'

declare global {
  namespace Cloudflare {
    interface Env extends CloudflareBindings {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}

vi.mock('../../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/r2')>()
  return {
    ...actual,
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'svc-test/key',
      expires_at: 9999999999,
    }),
    headObject: vi.fn().mockResolvedValue({ size: 1024 }),
    createMultipartUpload: vi.fn().mockResolvedValue({ upload_id: 'r2-up-1' }),
    completeMultipartUpload: vi.fn().mockResolvedValue(undefined),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
    listUploadedParts: vi.fn().mockResolvedValue([
      { PartNumber: 1, ETag: 'etag1', Size: 5_242_880 },
    ]),
    signUploadPart: vi.fn().mockResolvedValue({
      url: 'https://example.com/part',
      expires_at: 9999999999,
    }),
  }
})

const SERVICE_ID = 'svc-test'
const USER_ID = 'user-test'
const TEST_TIMEOUT = 15000

function buildApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>()
  app.use('*', async (c, next) => {
    c.set('userId', USER_ID as WorkerVariables['userId'])
    c.set('serviceId', SERVICE_ID as WorkerVariables['serviceId'])
    c.set('authType', 'jwt' as WorkerVariables['authType'])
    c.set('serviceRole', 'user' as WorkerVariables['serviceRole'])
    c.set('service', {
      id: SERVICE_ID, default_bucket: 'unisource-default',
      max_file_size_bytes: 100_000_000, object_key_prefix: 'svc-test',
    } as any)
    c.set('requestId', 'req-int')
    await next()
  })
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err)
    throw err
  })
  app.route('/upload', upload)
  return app
}

beforeAll(async () => {
  await applyD1Migrations(env.APP_DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.APP_DB.prepare('DELETE FROM uploads').run()
  await env.APP_DB.prepare('DELETE FROM files').run()
  await env.APP_DB.prepare(`
    INSERT OR REPLACE INTO services (id, default_bucket, max_file_size_bytes, object_key_prefix, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(SERVICE_ID, 'unisource-default', 100_000_000, 'svc-test', 0, 0).run()
})

describe('V2 upload — single flow (SDK ↔ backend)', () => {
  it('init → complete returns V2 envelope and creates file row', async () => {
    const app = buildApp()
    const client = new UnisourceV2Client({
      baseUrl: 'http://localhost',
      serviceId: SERVICE_ID,
      getToken: () => 'fake-token',
      silentBeta: true,
    })

    // Patch global fetch so client hits the test app.
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((req: Request) => app.fetch(req, env)) as typeof fetch

    try {
      const initResult = await client.upload.r2Init({
        filename: 'a.bin',
        size: 1024,
        mime_type: 'application/octet-stream',
      })
      expect(initResult.item.upload_id).toMatch(/^[0-9a-f-]{36}$/)
      expect(initResult.item.destination).toBe('r2')

      const completeResult = await client.upload.complete(initResult.item.upload_id)
      expect(completeResult.item.status).toBe('completed')
      expect(completeResult.item.upload_type).toBe('single')
      expect(completeResult.item.file_id).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  }, TEST_TIMEOUT)
})

describe('V2 upload — multipart flow (SDK ↔ backend)', () => {
  it('multipartCreate → signPart → listParts → multipartComplete returns V2 envelope', async () => {
    const app = buildApp()
    const client = new UnisourceV2Client({
      baseUrl: 'http://localhost',
      serviceId: SERVICE_ID,
      getToken: () => 'fake-token',
      silentBeta: true,
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = ((req: Request) => app.fetch(req, env)) as typeof fetch

    try {
      const create = await client.upload.multipartCreate({
        filename: 'big.bin',
        size: 1024,
        mime_type: 'application/octet-stream',
      })
      expect(create.item.r2_upload_id).toBe('r2-up-1')

      const signed = await client.upload.multipartSignPart(create.item.upload_id, 1)
      expect(signed.item.url).toMatch(/^https:\/\//)

      const list = await client.upload.multipartListParts(create.item.upload_id)
      expect(list.items).toHaveLength(1)
      expect(list.page.next_cursor).toBeNull()

      const completed = await client.upload.multipartComplete(create.item.upload_id, [
        { PartNumber: 1, ETag: 'etag1' },
      ])
      expect(completed.item.status).toBe('completed')
      expect(completed.item.upload_type).toBe('multipart')
      expect(completed.item.file_id).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  }, TEST_TIMEOUT)

  it('multipartCreate → multipartAbort marks upload failed', async () => {
    const app = buildApp()
    const client = new UnisourceV2Client({
      baseUrl: 'http://localhost',
      serviceId: SERVICE_ID,
      getToken: () => 'fake-token',
      silentBeta: true,
    })

    const originalFetch = globalThis.fetch
    globalThis.fetch = ((req: Request) => app.fetch(req, env)) as typeof fetch

    try {
      const create = await client.upload.multipartCreate({
        filename: 'big.bin',
        size: 1024,
        mime_type: 'application/octet-stream',
      })
      const aborted = await client.upload.multipartAbort(create.item.upload_id)
      expect(aborted.item.status).toBe('failed')
      expect(aborted.item.file_id).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  }, TEST_TIMEOUT)
})
```

(Executor: jeśli pattern z `globalThis.fetch` swap nie działa w `vitest-pool-workers` (Worker runtime), sprawdź jak `apps/backend/test/integration/v2-files-end-to-end.test.ts` to robi i adaptuj dokładnie tę technikę. Jeśli SDK używa absolute baseUrl + `fetch(url)`, w teście musi być patchowanie fetch. Alternatywa: stworzyć custom V2Request który omija fetch i wywołuje app.fetch bezpośrednio — patrz `transport.ts` żeby zobaczyć czy taki injection point istnieje.)

- [ ] **Step 3: Run integration test**:

```bash
pnpm --filter backend test apps/backend/test/integration/v2-upload-end-to-end.test.ts
```

Expected: 3 tests zielone.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/integration/v2-upload-end-to-end.test.ts
git commit -m "test(backend): add SDK↔backend integration test for V2 upload (single + multipart flows)"
```

---

## Phase F — Documentation

### Task 17: Changeset SDK (minor bump)

**Files:**
- Create: `.changeset/v2-section-2-upload.md`

- [ ] **Step 1: Utwórz changeset**:

```bash
cat > .changeset/v2-section-2-upload.md <<'EOF'
---
"@unisource/sdk": minor
---

V2 upload: full single + multipart flow added to `UnisourceV2Client.upload.*`.

New methods (8): `r2Init`, `appwriteInit`, `complete`, `multipartCreate`, `multipartSignPart`, `multipartListParts`, `multipartComplete`, `multipartAbort`. All return `{ item: ... }` envelope per V2 standard. List-parts uses V2 list envelope `{ items, page: { limit, next_cursor } }` (synthetic page — R2 returns all parts in one call).

New error codes added to `V2_ERROR_CODES` allowlist: `file_too_large`, `quota_exceeded`. Both have typed details: `file_too_large` carries `{ max_bytes }`, `quota_exceeded` carries `{ scope: 'user' | 'service', requested_bytes }`.

**Backend BREAKING (V2 contract on `beta` branch):** `POST /upload/fail` removed. Quota for failed/abandoned uploads is released by expiry (1h for single, 7 days for multipart) or future Queue cleanup processor. Multipart aborts retain explicit `DELETE /upload/r2/multipart/abort` because R2 multipart parts incur storage cost until `AbortMultipartUpload` is called.

**Legacy SDK status:** `UnisourceClient.upload.*` (legacy) is FROZEN — no changes. As a consequence, legacy callers of `client.upload.fail` will receive 404 from `beta` backend (endpoint no longer exists). This is consistent with other legacy contracts already broken against `beta` (see V2_MIGRATION.md §4.1 Known Limitations).
EOF
```

- [ ] **Step 2: Verify changeset content** (`cat .changeset/v2-section-2-upload.md`).

- [ ] **Step 3: Commit**

```bash
git add .changeset/v2-section-2-upload.md
git commit -m "chore(sdk): add changeset for V2 section 2 (minor bump, upload resource + 2 new error codes)"
```

---

### Task 18: Update `V2_MIGRATION.md`

**Files:**
- Modify: `V2_MIGRATION.md` (multiple sections — TL;DR, "Co to jest standard V2", §1 Backend, §2 SDK, §4.1 Known Limitations, §5 Pozostała praca, §"Definicja skończonej refaktoryzacji V2")

- [ ] **Step 1: Update header date** w pierwszej linijce:

```markdown
> Stan na **<DATA-DZISIEJSZEJ-SESJI>**. Wszystko na branchu `beta`. Sekcja 1 i 2 ukończone.
```

- [ ] **Step 2: Update TL;DR** (§"TL;DR" tabela):

```markdown
| Backend (Hono routes → V2 standard) | ~68% (68/100 handlerów) | Zmigrować `releases.ts`, `superadmin.ts` |
| SDK — `UnisourceV2Client` (nowy) | ~76% pokrycia (57 metod / 12 zasobów) | Sekcja 3 (releases) — pozostały legacy backend route |
```

(Liczby: 60+8=68 zmigrowanych. Total 100 = 101 - 1 (`/fail` removed). SDK metod 49+8=57, zasobów 11+1=12.)

- [ ] **Step 3: Update §"Co to jest standard V2"** — w punkcie 1 (lista error codes) dodaj `file_too_large` i `quota_exceeded`:

```markdown
1. **Error envelope**: `{ error: { code, message, request_id, details? } }` z helperem `V2Error` w `apps/backend/src/lib/v2/errors.ts`. Wszystkie kody są w zamkniętym zestawie:
   - `validation_error` · `cursor_invalid` · `search_too_long` · `unauthorized` · `forbidden` · `not_found` · `rate_limited` · `internal_error` · `conflict` · `bad_gateway` · `gone` · `file_too_large` · `quota_exceeded`
```

- [ ] **Step 4: Update §1 Backend "Zmigrowane do V2"** — dodaj wiersz `upload.ts` i zmień nagłówek:

```markdown
### Zmigrowane do V2 (68 handlerów, 13 plików)

| Plik | Handlery | Uwaga |
|---|---:|---|
| `admin.ts` | 11 | Cursor pagination, V2Error, v2ValidationHook |
| `app.ts` | 1 | `/app/releases/latest` |
| `fileRecords.ts` | 8 | `/my-files`, R2/Appwrite, najwięcej error pathów |
| `files.ts` | 4 | `/admin/files` |
| `folders.ts` | 6 | D1-only, recursive CTE, batch delete |
| `mainStorage.ts` | 5 | Cursor pagination |
| `public.ts` | 3 | 302 redirect, signed tokens, `gone` error code |
| `shareLinks.ts` | 4 | |
| `shares.ts` | 4 | Plan 2 contract |
| `upload.ts` | 8 | Single + multipart flow; `/fail` USUNIĘTY (BREAKING vs legacy) |
| `userFiles.ts` | 5 | `/files/:id` (Plan 2) |
| `v2/files.ts` | 2 | Nowy V2 namespace; `POST /v2/files/bulk` z action union |
| `v2/folders.ts` | 3 | `POST /v2/folders/bulk` z action union + cycle prevention |
```

- [ ] **Step 5: Update §1 Backend "Pozostałe legacy"** — usuń `upload.ts`, zmień nagłówek na 2 plików:

```markdown
### Pozostałe legacy (32 handlery, 2 pliki)

| Plik | Handlery | Linii | Główna złożoność |
|---|---:|---:|---|
| `superadmin.ts` | 18 | 313 | Dynamic SQL, brak V2 helperów; chroniony przez CF Access — **internal**, nie powinien trafić do SDK |
| `releases.ts` | 14 | 596 | Złożony flow releasów, własny `validationErrorHook` |
```

(32 = 18 + 14. Pamiętaj: total = 68 zmigrowanych + 32 legacy = 100; 1 handler usunięty.)

- [ ] **Step 6: Update §1 Backend "Znane drobiazgi"** — usuń wzmiankę o `validationErrorHook` w `upload.ts` (zostaje tylko `releases.ts`).

- [ ] **Step 7: Update §2 SDK** — w tabeli "UnisourceV2Client" dodaj wiersz `upload`, update bullet "Czego brakuje":

```markdown
| `upload` | `r2Init`, `appwriteInit`, `complete`, `multipartCreate`, `multipartSignPart`, `multipartListParts`, `multipartComplete`, `multipartAbort` | `/upload/*` | ✅ pełne (single + multipart, bez `fail` — usunięty BREAKING) |

**Czego brakuje w `UnisourceV2Client`** (na sekcję 3-4):

- `releases.*` — 14 endpointów, backend wciąż legacy. Sekcja 3.
```

- [ ] **Step 8: Update §4.1 Known Limitations** — dodaj 2 wpisy:

```markdown
- **BREAKING in V2 beta:** `POST /upload/fail` removed. Legacy `UnisourceClient.upload.fail` will return 404 against `beta` backend. Quota for failed/abandoned uploads is released by expiry (1h single, 7 days multipart) or by future Queue cleanup processor. V2 beta has no production consumers — change documented in changeset.
- **`UnisourceClient.upload.*` (legacy) broken against `beta` backend.** As with `client.v2.bulk*` and other legacy contracts (§4.1), the legacy upload namespace is not updated for V2 envelope. Legacy `upload.complete`/`upload.r2Init`/etc. will receive V2 error/success shapes that don't match legacy zod schemas. No production consumers — V2 beta is not used in production. Decision: leave as-is, remove `client.upload.*` legacy callers (none exist) when V2 is fully merged.
```

- [ ] **Step 9: Update §5 Pozostała praca** — usuń wpis o `upload.ts`, zaktualizuj kolejność:

```markdown
1. **`releases.ts` backend → V2** (14 handlerów) **+ `UnisourceV2Client.releases.*`** — sekcja 3.
2. **`superadmin.ts` backend → V2** (18 handlerów) — sekcja 4. Internal, nie wymaga SDK.
3. **Cleanup**: spójność bulk delete vs storage cleanup (R2/Appwrite), folder bulk move performance (jeden globalny CTE), Queue cleanup processor dla expired uploads (zamiennik usuniętego `upload.fail`).
4. **Backend auth**: dodać `/v2/*` jako dual-auth w `getAuthRouteMode()` aby `apiKey` działał dla `/v2/files` i `/v2/folders` (known limitation §4.1).
```

- [ ] **Step 10: Update §"Definicja skończonej refaktoryzacji V2"** — checkbox progress:

```markdown
- [~] Wszystkie route'y backendu używają V2Error / V2 helpers — **brak własnych `validationErrorHook`**. ← upload.ts done; releases.ts + superadmin.ts pozostają (sekcje 3-4)
- [~] `UnisourceV2Client` pokrywa wszystkie publiczne endpointy (poza `superadmin/*` i czysto wewnętrznymi). ← upload done; releases pozostaje (sekcja 3)
```

- [ ] **Step 11: Run final full test suite** żeby potwierdzić, że wszystko działa po dokumentacji:

```bash
pnpm --filter backend test
pnpm --filter @unisource/sdk build
pnpm --filter @unisource/sdk test
```

Expected: cały zielony.

- [ ] **Step 12: Commit**

```bash
git add V2_MIGRATION.md
git commit -m "docs(root): update V2_MIGRATION.md after section 2 (upload migrated, /fail removed, 2 new error codes)"
```

---

## Self-review checklist (executor — przebieg po Tasku 18)

Przed zgłoszeniem definicji końca, executor uruchamia `superpowers:verification-before-completion` skill:

- [ ] `pnpm --filter backend test` — wszystkie testy zielone.
- [ ] `pnpm --filter @unisource/sdk build` — clean build.
- [ ] `pnpm --filter @unisource/sdk test` — wszystkie testy zielone.
- [ ] `grep -n "validationErrorHook" apps/backend/src/routes/upload.ts` — empty (helper usunięty).
- [ ] `grep -n "mainStorageForbiddenResponse" apps/backend/src/routes/upload.ts` — empty (import usunięty).
- [ ] `grep -n "upload.fail" apps/backend/src/routes/upload.ts` — empty (handler usunięty).
- [ ] `apps/backend/test/lib/v2/error-codes.contract.test.ts` zielony (`file_too_large` + `quota_exceeded` zsynchronizowane SDK↔backend).
- [ ] `client.upload.r2Init` etc. dostępne z `import { UnisourceV2Client } from '@unisource/sdk/v2'`.
- [ ] `V2_MIGRATION.md` pokazuje 68/100 handlerów, `upload.ts` w "Zmigrowane".
- [ ] Changeset minor bump utworzony i committed.
- [ ] Wszystkie commity mają poprawny prefix (`feat(sdk):`, `feat(backend):`, `refactor(backend):`, `chore(...)`, `docs(root):`, `test(backend):`).

Po zielonym checkliście — wywołać `superpowers:finishing-a-development-branch` skill (zaproponować userowi opcje merge / PR / cleanup; **NIE merge'ować sam do `main`**, V2 zostaje na `beta` zgodnie z `[[project-branch-model]]`).
