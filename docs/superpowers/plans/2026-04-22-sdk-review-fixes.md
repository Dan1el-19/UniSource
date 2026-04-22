# SDK Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Naprawić 12 problemów znalezionych podczas code review paczki `@unisource/sdk`, eliminując niespójności API, błędy konfiguracji buildu i luki w testach.

**Architecture:** Zmiany dotyczą wyłącznie `packages/unisource-sdk/` — pliki źródłowe (`src/`), konfiguracja (`package.json`, `tsdown.config.ts`) oraz testy (`tests/`). Żaden plik poza tym katalogiem nie jest modyfikowany.

**Tech Stack:** TypeScript 6, Zod 4, tsdown 0.21, Vitest 4, pnpm

---

## Pliki dotknięte przez plan

| Plik | Operacja | Powód |
|------|----------|-------|
| `package.json` | Modify | types + exports → dist (nie src) |
| `tsdown.config.ts` | Modify | usuń placeholder, wyczyść config |
| `src/uploads.ts` | Modify | użyj `uploadStatusSchema` zamiast inline enum |
| `src/folders.ts` | Modify | usuń duplikat `trashed`, użyj `FILES_MAX_LIMIT` |
| `src/services.ts` | Modify | `adminServiceUpdateRequest` — pola `.optional()` |
| `src/shareLinks.ts` | Modify | dodaj `shareLinkDeleteResponseSchema`, `.refine()` na update |
| `src/client.ts` | Modify | importy na górę, `signal` w `trash`/`folders.get`, użyj nowego schematu, scal `publicApiRequest` |
| `tests/index.test.ts` | Modify | nowe testy pokrywające naprawione miejsca |

---

## Task 1: Napraw konfigurację build + package.json exports

**Problem:** `package.json` wskazuje `types` na `./src/index.ts` (źródło TS) zamiast na skompilowane `.d.mts`. Build script zawiera hack kopiujący `.d.mts` → `.d.ts` zamiast poprawnej konfiguracji. `tsdown.config.ts` ma nieusunięty komentarz-placeholder.

**Research:** tsdown z `dts: { tsgo: true }` generuje `dist/index.d.mts` (nie `.d.ts`) dla paczek ESM-only. Poprawne podejście to wskazanie na `./dist/index.d.mts` we wszystkich polach typów. Hack z kopiowaniem jest zbędny.

**Files:**
- Modify: `packages/unisource-sdk/package.json`
- Modify: `packages/unisource-sdk/tsdown.config.ts`

- [ ] **Step 1.1: Zaktualizuj package.json**

Zamień zawartość `packages/unisource-sdk/package.json`:

```json
{
  "name": "@unisource/sdk",
  "private": false,
  "type": "module",
  "version": "0.2.0",
  "description": "Wspolne kontrakty danych dla backendu i frontendu UniSource.",
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs",
      "default": "./dist/index.mjs"
    },
    "./package.json": "./package.json"
  },
  "types": "./dist/index.d.mts",
  "files": [
    "dist",
    "src"
  ],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "test": "pnpm run build && vitest",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run build"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "@typescript/native-preview": "7.0.0-dev.20260328.1",
    "tsdown": "^0.21.7",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  },
  "dependencies": {
    "zod": "^4.3.6"
  }
}
```

Kluczowe zmiany:
- `"types"`: `"./src/index.ts"` → `"./dist/index.d.mts"`
- `"exports"["."]["types"]`: `"./src/index.ts"` → `"./dist/index.d.mts"`
- `"build"` script: usunięty `&& node -e "..."` hack

- [ ] **Step 1.2: Wyczyść tsdown.config.ts**

```typescript
import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
})
```

(Usuń tylko linię `// ...config options` — reszta zostaje.)

- [ ] **Step 1.3: Zbuduj i sprawdź output**

```bash
cd packages/unisource-sdk && pnpm run build
```

Oczekiwane: `dist/index.mjs` i `dist/index.d.mts` istnieją, brak błędów.

```bash
ls dist/
```

Powinno pokazać: `index.mjs`, `index.d.mts` (i ewentualnie `index.d.ts` jeśli `exports: true` go generuje — ok).

- [ ] **Step 1.4: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie testy PASS. Test `'exposes importable built package entrypoint'` sprawdza `dist/index.mjs`.

- [ ] **Step 1.5: Commit**

```bash
git add packages/unisource-sdk/package.json packages/unisource-sdk/tsdown.config.ts
git commit -m "fix(sdk): point types to dist/index.d.mts, remove build hack"
```

---

## Task 2: Napraw inline enum w `uploads.ts`

**Problem:** `uploadRecordSchema.status` używa `z.enum(['pending', 'completed', 'failed'])` zamiast zaimportowanego `uploadStatusSchema`. Jeśli enum się zmieni, trzeba zmienić w dwóch miejscach.

**Files:**
- Modify: `packages/unisource-sdk/src/uploads.ts:79`

- [ ] **Step 2.1: Napisz test weryfikujący (regresja)**

W `tests/index.test.ts`, w bloku `describe('unisource-sdk schemas', ...)`, dodaj:

```typescript
it('uploadRecordSchema.status rejects values outside uploadStatusSchema', () => {
  const base = {
    id: 'u1',
    service_id: 'svc',
    user_id: null,
    filename: 'a.pdf',
    size: 100,
    mime_type: 'application/pdf',
    destination: 'r2',
    expires_at: 1_900_000_000,
    created_at: 1_800_000_000,
    updated_at: 1_800_000_010,
  };
  expect(uploadRecordSchema.safeParse({ ...base, status: 'completed' }).success).toBe(true);
  expect(uploadRecordSchema.safeParse({ ...base, status: 'archived' }).success).toBe(false);
});
```

Dodaj import `uploadRecordSchema` do listy importów na górze pliku testowego.

- [ ] **Step 2.2: Uruchom test (powinien PASS — weryfikacja że nie regresja)**

```bash
pnpm --filter @unisource/sdk test
```

- [ ] **Step 2.3: Napraw uploads.ts**

W `packages/unisource-sdk/src/uploads.ts`, zmień linię 79:

```typescript
// PRZED:
status: z.enum(['pending', 'completed', 'failed']),

// PO:
status: uploadStatusSchema,
```

- [ ] **Step 2.4: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 2.5: Commit**

```bash
git add packages/unisource-sdk/src/uploads.ts packages/unisource-sdk/tests/index.test.ts
git commit -m "fix(sdk): use uploadStatusSchema in uploadRecordSchema.status"
```

---

## Task 3: Przenieś importy na górę `client.ts`

**Problem:** Importy `type {...} from './uploads'`, `'./fileRecords'` itd. zaczynają się od linii ~133, po definicjach `apiRequest` i `publicApiRequest`. Narusza konwencję "importy na górze pliku".

**Files:**
- Modify: `packages/unisource-sdk/src/client.ts`

- [ ] **Step 3.1: Przeorganizuj client.ts**

Nowa kolejność pliku:

```typescript
// ─── Imports ─────────────────────────────────────────────────────────────────
import type { ApiError, UploadStatus } from './primitives';

import type {
  UploadR2InitRequest,
  UploadR2InitResponse,
  UploadAppwriteInitRequest,
  UploadAppwriteInitResponse,
  UploadLifecycleRequest,
  UploadCompleteResponse,
  UploadFailResponse,
  UploadsListResponse,
  UploadRecordDetailResponse,
} from './uploads';

import type {
  FileRecord,
  FileRecordsListQuery,
  FileRecordsListResponse,
  FileRecordDetailResponse,
  FileMoveRequest,
  FileDownloadUrlResponse,
  FileDeleteResponse,
  FileRestoreResponse,
  FileUpdateRequest,
  FileUpdateResponse,
} from './fileRecords';

import type {
  FolderListQuery,
  FolderListResponse,
  FolderDetailResponse,
  FolderCreateRequest,
  FolderCreateResponse,
  FolderUpdateRequest,
  FolderUpdateResponse,
  FolderDeleteResponse,
  FolderRestoreResponse,
} from './folders';

import type {
  ServiceDetailResponse,
  ServiceUsageResponse,
  AdminServiceUpdateRequest,
  AdminServiceUpdateResponse,
  AuditLogListQuery,
  AuditLogListResponse,
  AdminUserListResponse,
  AdminUserUpdateRequest,
  AdminUserUpdateResponse,
  AdminUserPasswordResetRequest,
  AdminUserPasswordResetResponse,
} from './services';

import type {
  ShareLinkCreateRequest,
  ShareLinkCreateResponse,
  ShareLinkListResponse,
  PublicFileAccessResponse,
  PublicFileLockedResponse,
  ShareLinkUpdateRequest,
  ShareLinkUpdateResponse,
  ShareLinkDeleteResponse,
} from './shareLinks';

// ─── SDK Error classes ────────────────────────────────────────────────────────
// ... (reszta pliku bez zmian poza importami)
```

`ShareLinkDeleteResponse` zostanie dodany w Task 6 — wstaw import już teraz z pozostałymi.

- [ ] **Step 3.2: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 3.3: Commit**

```bash
git add packages/unisource-sdk/src/client.ts
git commit -m "refactor(sdk): move imports to top of client.ts"
```

---

## Task 4: Dodaj brakujące parametry `signal`

**Problem:** `myFiles.trash` i `folders.get` nie akceptują `AbortSignal` w przeciwieństwie do wszystkich innych metod.

**Files:**
- Modify: `packages/unisource-sdk/src/client.ts`

- [ ] **Step 4.1: Napisz test**

W `tests/index.test.ts`, w bloku `describe('unisource-sdk HTTP helpers', ...)`, dodaj:

```typescript
it('passes AbortSignal to trash and folders.get requests', async () => {
  const controller = new AbortController();
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.signal).toBe(controller.signal);
    return new Response(
      JSON.stringify({ items: [], next_cursor: null, limit: 25 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const client = new UnisourceClient({
    baseUrl: 'https://api.example.com',
    serviceId: 'usrc',
    getToken: async () => 'tok',
  });

  await client.myFiles.trash(undefined, controller.signal);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4.2: Uruchom test (powinien FAIL)**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: FAIL — `myFiles.trash` nie przyjmuje drugiego argumentu.

- [ ] **Step 4.3: Napraw client.ts**

Zmień metody w klasie `UnisourceClient`:

```typescript
// PRZED:
trash: (query?: { cursor?: string; limit?: number }): Promise<FileRecordsListResponse> =>
  apiRequest(this.config, 'GET', '/my-files/trash', { query }),

// PO:
trash: (query?: { cursor?: string; limit?: number }, signal?: AbortSignal): Promise<FileRecordsListResponse> =>
  apiRequest(this.config, 'GET', '/my-files/trash', { query, signal }),
```

```typescript
// PRZED:
get: (id: string): Promise<FolderDetailResponse> =>
  apiRequest(this.config, 'GET', `/folders/${id}`),

// PO:
get: (id: string, signal?: AbortSignal): Promise<FolderDetailResponse> =>
  apiRequest(this.config, 'GET', `/folders/${id}`, { signal }),
```

- [ ] **Step 4.4: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 4.5: Commit**

```bash
git add packages/unisource-sdk/src/client.ts packages/unisource-sdk/tests/index.test.ts
git commit -m "fix(sdk): add missing AbortSignal to myFiles.trash and folders.get"
```

---

## Task 5: `adminServiceUpdateRequest` — pola opcjonalne

**Problem:** `adminServiceUpdateRequestSchema` wymaga obu pól obowiązkowo, ale to endpoint PATCH — partial update powinien być możliwy. `adminUserUpdateRequestSchema` robi to poprawnie.

**Files:**
- Modify: `packages/unisource-sdk/src/services.ts:22-26`

- [ ] **Step 5.1: Napisz test**

W `tests/index.test.ts`, w bloku schemas, dodaj:

```typescript
it('adminServiceUpdateRequestSchema allows partial update', () => {
  const { adminServiceUpdateRequestSchema } = await import('../src');

  expect(adminServiceUpdateRequestSchema.safeParse({
    max_storage_bytes: 10_000_000_000,
  }).success).toBe(true);

  expect(adminServiceUpdateRequestSchema.safeParse({
    max_file_size_bytes: 500_000_000,
  }).success).toBe(true);

  expect(adminServiceUpdateRequestSchema.safeParse({}).success).toBe(false);
});
```

Dodaj `adminServiceUpdateRequestSchema` do importów w pliku testowym.

- [ ] **Step 5.2: Uruchom test (powinien FAIL)**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: FAIL — pusty obiekt powinien nie przejść, ale teraz `{}` nie przechodzi bo pola są wymagane; test z częściowym obiektem FAIL bo pole jest wymagane.

- [ ] **Step 5.3: Napraw services.ts**

```typescript
// PRZED (services.ts:22):
export const adminServiceUpdateRequestSchema = z.object({
  max_storage_bytes: positiveInt,
  max_file_size_bytes: positiveInt,
});

// PO:
export const adminServiceUpdateRequestSchema = z
  .object({
    max_storage_bytes: positiveInt.optional(),
    max_file_size_bytes: positiveInt.optional(),
  })
  .refine(
    (v) => v.max_storage_bytes !== undefined || v.max_file_size_bytes !== undefined,
    { message: 'At least one of max_storage_bytes or max_file_size_bytes must be provided' }
  );
```

Zaktualizuj też typ:
```typescript
export type AdminServiceUpdateRequest = z.infer<typeof adminServiceUpdateRequestSchema>;
```
(Typ zmieni się automatycznie po zmianie schematu.)

- [ ] **Step 5.4: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 5.5: Commit**

```bash
git add packages/unisource-sdk/src/services.ts packages/unisource-sdk/tests/index.test.ts
git commit -m "fix(sdk): make adminServiceUpdateRequest fields optional (PATCH semantics)"
```

---

## Task 6: Dodaj `shareLinkDeleteResponseSchema` + `.refine()` na update

**Problem 1:** `shareLinks.delete` w kliencie zwraca inline typ `{ success: true; id: string }` bez schematu Zod — jedyny endpoint bez walidacji schematu.

**Problem 2:** `shareLinkUpdateRequestSchema` akceptuje pusty obiekt `{}` (wszystkie pola `.optional()`, brak `.refine()`). `folderUpdateRequestSchema` robi to poprawnie.

**Files:**
- Modify: `packages/unisource-sdk/src/shareLinks.ts`
- Modify: `packages/unisource-sdk/src/client.ts`

- [ ] **Step 6.1: Napisz testy**

```typescript
it('shareLinkUpdateRequestSchema rejects empty object', () => {
  const { shareLinkUpdateRequestSchema } = await import('../src');
  expect(shareLinkUpdateRequestSchema.safeParse({}).success).toBe(false);
  expect(shareLinkUpdateRequestSchema.safeParse({ is_active: false }).success).toBe(true);
});
```

Dodaj `shareLinkUpdateRequestSchema` do importów testowych.

- [ ] **Step 6.2: Uruchom test (powinien FAIL)**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: FAIL — `{}` teraz przechodzi.

- [ ] **Step 6.3: Zaktualizuj shareLinks.ts**

Dodaj na końcu pliku (po `publicFileLockedResponseSchema`):

```typescript
// ─── Delete ───────────────────────────────────────────────────────────────────
export const shareLinkDeleteResponseSchema = z.object({
  success: z.literal(true),
  id: nonEmptyString,
});
export type ShareLinkDeleteResponse = z.infer<typeof shareLinkDeleteResponseSchema>;
```

Zaktualizuj `shareLinkUpdateRequestSchema` dodając `.refine()`:

```typescript
// PRZED:
export const shareLinkUpdateRequestSchema = z.object({
  name: z.string().trim().max(128).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).nullable().optional(),
  expires_at: unixTimestamp.nullable().optional(),
  max_downloads: positiveInt.nullable().optional(),
});

// PO:
export const shareLinkUpdateRequestSchema = z
  .object({
    name: z.string().trim().max(128).nullable().optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(1).nullable().optional(),
    expires_at: unixTimestamp.nullable().optional(),
    max_downloads: positiveInt.nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.is_active !== undefined ||
      v.password !== undefined ||
      v.expires_at !== undefined ||
      v.max_downloads !== undefined,
    { message: 'At least one field must be provided' }
  );
```

- [ ] **Step 6.4: Zaktualizuj client.ts — użyj `ShareLinkDeleteResponse`**

```typescript
// PRZED:
delete: (linkId: string, signal?: AbortSignal): Promise<{ success: true; id: string }> =>
  apiRequest(this.config, 'DELETE', `/share-links/${linkId}`, { signal }),

// PO:
delete: (linkId: string, signal?: AbortSignal): Promise<ShareLinkDeleteResponse> =>
  apiRequest(this.config, 'DELETE', `/share-links/${linkId}`, { signal }),
```

(Import `ShareLinkDeleteResponse` jest już dodany w Task 3.)

Zaktualizuj też export w `src/index.ts` — dodaj do sekcji Share Links:

```typescript
export {
  // ...istniejące
  shareLinkDeleteResponseSchema,
} from './shareLinks';
export type {
  // ...istniejące
  ShareLinkDeleteResponse,
} from './shareLinks';
```

- [ ] **Step 6.5: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 6.6: Commit**

```bash
git add packages/unisource-sdk/src/shareLinks.ts packages/unisource-sdk/src/client.ts packages/unisource-sdk/src/index.ts packages/unisource-sdk/tests/index.test.ts
git commit -m "fix(sdk): add shareLinkDeleteResponseSchema, add refine to shareLinkUpdateRequest"
```

---

## Task 7: Napraw `folderListQuerySchema` — duplikacja i hardcoded limit

**Problem:** `folderListQuerySchema` ma zarówno `trashed` (deprecated alias) jak i `is_trashed` (kanoniczne). Wysłanie obu jednocześnie przejdzie walidację z potencjalnie sprzecznymi wartościami. Limit `max(100)` jest hardcoded zamiast używać `FILES_MAX_LIMIT`.

**Files:**
- Modify: `packages/unisource-sdk/src/folders.ts`

- [ ] **Step 7.1: Napisz test**

```typescript
it('folderListQuerySchema rejects when both trashed and is_trashed provided', () => {
  const { folderListQuerySchema } = await import('../src');
  expect(
    folderListQuerySchema.safeParse({ trashed: true, is_trashed: false }).success
  ).toBe(false);
});

it('folderListQuerySchema rejects limit above FILES_MAX_LIMIT', () => {
  const { folderListQuerySchema, FILES_MAX_LIMIT } = await import('../src');
  expect(folderListQuerySchema.safeParse({ limit: FILES_MAX_LIMIT + 1 }).success).toBe(false);
  expect(folderListQuerySchema.safeParse({ limit: FILES_MAX_LIMIT }).success).toBe(true);
});
```

- [ ] **Step 7.2: Uruchom testy (powinny FAIL)**

```bash
pnpm --filter @unisource/sdk test
```

- [ ] **Step 7.3: Napraw folders.ts**

Dodaj import `FILES_MAX_LIMIT` (już jest import z `primitives` — rozszerz go):

```typescript
import { nonEmptyString, positiveInt, FILES_MAX_LIMIT } from './primitives';
```

Zaktualizuj schemat:

```typescript
export const folderListQuerySchema = z
  .object({
    parent_id: nonEmptyString.nullable().optional(),
    trashed: z.boolean().optional(),
    is_trashed: z.boolean().optional(),
    cursor: nonEmptyString.optional(),
    limit: z.number().int().min(1).max(FILES_MAX_LIMIT).optional(),
  })
  .refine(
    (v) => !(v.trashed !== undefined && v.is_trashed !== undefined),
    { message: 'Use either trashed or is_trashed, not both' }
  );
```

- [ ] **Step 7.4: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS, włącznie ze starym testem `'accepts folder trash query with canonical and deprecated aliases'`.

- [ ] **Step 7.5: Commit**

```bash
git add packages/unisource-sdk/src/folders.ts packages/unisource-sdk/tests/index.test.ts
git commit -m "fix(sdk): prevent conflicting trashed fields in folderListQuerySchema, use FILES_MAX_LIMIT"
```

---

## Task 8: Scal `apiRequest` i `publicApiRequest` (DRY)

**Problem:** Dwie funkcje fetch różnią się jedynie dodaniem nagłówków auth i X-Service-ID. ~40 linii zduplikowanego kodu.

**Files:**
- Modify: `packages/unisource-sdk/src/client.ts`

- [ ] **Step 8.1: Refaktoruj client.ts**

Zastąp obie funkcje jedną:

```typescript
async function internalFetch<T>(
  method: string,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const url = new URL(path, options.headers?.['X-Base-URL'] ?? '');
  // Zamiast tego, przekaż baseUrl przez parametr:
}
```

Właściwa sygnatura — zastąp **obie** funkcje:

```typescript
async function fetchApi<T>(
  baseUrl: string,
  method: string,
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined | null>;
    signal?: AbortSignal;
    authHeaders?: Record<string, string>;
  } = {}
): Promise<T> {
  const url = new URL(path, baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = { ...options.authHeaders };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    throw new UnisourceNetworkError('Network request failed', err);
  }

  if (!response.ok) {
    let body: ApiError;
    try {
      body = (await response.json()) as ApiError;
    } catch {
      body = { error: 'Unknown', message: response.statusText };
    }
    throw new UnisourceError(body.message, response.status, body);
  }

  return response.json() as Promise<T>;
}
```

Zaktualizuj `apiRequest` (helper dla authenticated requests):

```typescript
function apiRequest<T>(
  config: UnisourceClientConfig,
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal } = {}
): Promise<T> {
  return fetchApi<T>(config.baseUrl, method, path, {
    ...options,
    authHeaders: (() => {
      // token jest async — musimy go pobrać
      // Uwaga: ta funkcja musi pozostać async!
    })(),
  });
}
```

**Uwaga:** `config.getToken()` jest async, więc `apiRequest` musi być `async`. Dopasuj:

```typescript
async function apiRequest<T>(
  config: UnisourceClientConfig,
  method: string,
  path: string,
  options: { body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal } = {}
): Promise<T> {
  const token = await config.getToken();
  const authHeaders: Record<string, string> = {
    'X-Service-ID': config.serviceId,
  };
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }
  return fetchApi<T>(config.baseUrl, method, path, { ...options, authHeaders });
}
```

Zaktualizuj `getPublicFileInfo` i `unlockPublicFile`:

```typescript
export function getPublicFileInfo(
  baseUrl: string,
  slug: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return fetchApi(baseUrl, 'GET', `/public/${encodeURIComponent(slug)}`, { signal });
}

export function unlockPublicFile(
  baseUrl: string,
  slug: string,
  password: string,
  signal?: AbortSignal
): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return fetchApi(baseUrl, 'POST', `/public/${encodeURIComponent(slug)}/unlock`, {
    body: { password },
    signal,
  });
}
```

- [ ] **Step 8.2: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS — zachowanie bez zmian, tylko refaktor wewnętrzny.

- [ ] **Step 8.3: Commit**

```bash
git add packages/unisource-sdk/src/client.ts
git commit -m "refactor(sdk): merge apiRequest/publicApiRequest into fetchApi"
```

---

## Task 9: Dodaj testy dla `UnisourceNetworkError`

**Problem:** Brak testu dla `UnisourceNetworkError` — rzucanego gdy fetch rzuca (np. brak sieci).

**Files:**
- Modify: `packages/unisource-sdk/tests/index.test.ts`

- [ ] **Step 9.1: Dodaj test**

W bloku `describe('unisource-sdk HTTP helpers', ...)`:

```typescript
it('throws UnisourceNetworkError on network failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

  const client = new UnisourceClient({
    baseUrl: 'https://api.example.com',
    serviceId: 'usrc',
    getToken: async () => 'tok',
  });

  await expect(client.myFiles.list()).rejects.toBeInstanceOf(UnisourceNetworkError);
});
```

Dodaj `UnisourceNetworkError` do importów testowych.

- [ ] **Step 9.2: Uruchom testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS.

- [ ] **Step 9.3: Commit**

```bash
git add packages/unisource-sdk/tests/index.test.ts
git commit -m "test(sdk): add UnisourceNetworkError coverage"
```

---

## Weryfikacja końcowa

- [ ] **Pełny build od zera**

```bash
cd packages/unisource-sdk && rm -rf dist && pnpm run build
```

- [ ] **Pełne testy**

```bash
pnpm --filter @unisource/sdk test
```

Oczekiwane: wszystkie PASS, brak błędów TypeScript.

- [ ] **Typecheck całego monorepo**

```bash
pnpm --filter @unisource/sdk typecheck
```

---

## Self-Review

### Pokrycie problemów z review

| # | Problem | Task | Status |
|---|---------|------|--------|
| 1 | `types` → src zamiast dist | Task 1 | ✅ |
| 2 | `uploadRecordSchema.status` inline enum | Task 2 | ✅ |
| 3 | Importy poniżej kodu w client.ts | Task 3 | ✅ |
| 4 | Brak `signal` w `trash`/`folders.get` | Task 4 | ✅ |
| 5 | `adminServiceUpdateRequest` — PATCH wymaga obu | Task 5 | ✅ |
| 6 | `shareLinks.delete` — brak schematu | Task 6 | ✅ |
| 7 | `shareLinkUpdateRequest` — pusty obiekt przechodzi | Task 6 | ✅ |
| 8 | `trashed`/`is_trashed` duplikacja + hardcoded limit | Task 7 | ✅ |
| 9 | `apiRequest`/`publicApiRequest` duplikacja | Task 8 | ✅ |
| 10 | Build hack `.d.mts` → `.d.ts` | Task 1 | ✅ |
| 11 | Komentarz-placeholder w tsdown.config.ts | Task 1 | ✅ |
| 12 | Cienkie testy — brak `NetworkError`, `UnisourceNetworkError` | Task 9 | ✅ |

### Nie uwzględnione (świadome pominięcia)

- **Bleeding-edge toolchain** — to decyzja projektu, nie błąd do naprawy w tym planie
- **Brak runtime validation odpowiedzi** — istotna zmiana API, wymaga osobnej dyskusji z właścicielem paczki
- `name` w `adminUserSchema` to `z.string()` (nie `nonEmptyString`) — może być puste, ale to może być celowe (Appwrite może zwracać puste imię)
