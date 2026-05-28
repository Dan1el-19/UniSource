# V2 Migration Section 1 — SDK Parity + Transport Debt — Implementation Plan

> **For agentic workers:** Plan ma DWA etapy z różnymi sub-skillami:
> - **Etap 1.A** (zadania 1-15) — REQUIRED SUB-SKILL: `superpowers:executing-plans`. Wykonanie inline, sekwencyjnie, jeden agent. NIE używać subagentów.
> - **Etap 1.B** (zadania 16-18) — REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Trzy subagenty równolegle w osobnych worktree.
>
> Steps używają checkbox (`- [ ]`) syntax do trackingu.

**Goal:** SDK V2 osiąga parytet z backendem dla folders/myFiles/admin/public; bulk envelope, V2ErrorCode i auth API-key path są ujednolicone.

**Architecture:** Dwa etapy. Etap 1.A buduje fundament (V2ErrorCode jako `as const` array — dwie kopie SDK+backend z contract testem; transport z `apiKey` i per-request `auth: 'none'`; nowy bulk envelope `{processed, failed[]}`; jeden `POST /v2/<resource>/bulk` endpoint per zasób z dyskryminowanym union body). Etap 1.B dorzuca trzy zasoby SDK równolegle (folders CRUD + myFiles, admin, public).

**Tech Stack:**
- SDK: TypeScript, zod 4, vitest 4, tsdown
- Backend: TypeScript, Hono 4, zod 4, Cloudflare Workers, D1, `@cloudflare/vitest-pool-workers`
- Monorepo: pnpm workspaces, changesets

**Spec źródłowy:** `docs/superpowers/specs/2026-05-28-v2-section-1-sdk-parytet-design.md`

---

## File Structure — co tworzymy / modyfikujemy

### Etap 1.A — Fundament

**SDK (tworzone):**
- `packages/unisource-sdk/src/v2/error-codes.ts` — `V2_ERROR_CODES` array, type, `isV2ErrorCode`
- `packages/unisource-sdk/src/v2/__tests__/error-codes.test.ts` — testy helpera
- `packages/unisource-sdk/src/v2/__tests__/transport-auth.test.ts` — testy auth ścieżek (apiKey/getToken/auth:'none'/both)
- `packages/unisource-sdk/src/v2/__tests__/transport-error-parsing.test.ts` — testy parsera błędów (unknown→'unknown', rawCode)
- `packages/unisource-sdk/src/v2/bulk-schemas.ts` — `v2BulkFailureSchema`, `v2BulkResponseSchema`
- `packages/unisource-sdk/src/v2/__tests__/bulk-schemas.test.ts` — testy parsowania bulk response

**SDK (modyfikowane):**
- `packages/unisource-sdk/src/v2/errors.ts` — `code: V2ErrorCode | 'unknown'`, `rawCode?: string`
- `packages/unisource-sdk/src/v2/transport.ts` — `auth?: V2AuthMode` w `V2RequestOptions`, ścieżka apiKey, parser unknown code, walidacja both
- `packages/unisource-sdk/src/v2/client.ts` — `apiKey?: string` w configu, walidacja w constructorze
- `packages/unisource-sdk/src/v2/index.ts` — eksport nowych publicznych typów (`V2ErrorCode`, `V2_ERROR_CODES`, `isV2ErrorCode`, `V2BulkResponse`, etc.)

**Backend (tworzone):**
- `apps/backend/src/lib/v2/error-codes.ts` — `V2_ERROR_CODES` array (kopia identyczna z SDK), type
- `apps/backend/test/v2-error-codes.contract.test.ts` — contract test SDK vs backend
- `apps/backend/test/routes/v2/files-bulk.test.ts` — testy `POST /v2/files/bulk`
- `apps/backend/test/routes/v2/folders-bulk.test.ts` — testy `POST /v2/folders/bulk` + cycle prevention

**Backend (modyfikowane):**
- `apps/backend/src/lib/v2/errors.ts` — import `V2ErrorCode` z lokalnego `error-codes.ts`
- `apps/backend/src/routes/v2/files.ts` — dodanie `POST /v2/files/bulk` z discriminated union
- `apps/backend/src/routes/v2/folders.ts` — dodanie `POST /v2/folders/bulk` z cycle prevention
- `apps/backend/src/db/fileRecords.ts` — refaktor bulk helperów do per-id wyników
- `apps/backend/src/db/folders.ts` — bulk helpery dla folderów (move z cycle prevention, delete subtree, restore subtree)

**Backend (usuwane):**
- `apps/backend/src/routes/v2/files.legacy.ts` — cała logika wciela się do `v2/files.ts`

### Etap 1.B — Zasoby SDK

**Subagent #1 — folders CRUD + myFiles** (worktree `wt-folders-myfiles`):
- Tworzone: `packages/unisource-sdk/src/v2/resources/my-files.ts`, `packages/unisource-sdk/src/v2/my-files-schemas.ts`, `packages/unisource-sdk/src/v2/__tests__/folders-crud.test.ts`, `packages/unisource-sdk/src/v2/__tests__/my-files.test.ts`
- Modyfikowane: `packages/unisource-sdk/src/v2/resources/folders.ts` (5 nowych metod), `packages/unisource-sdk/src/v2/client.ts` (dodaj `readonly myFiles`), `packages/unisource-sdk/src/v2/index.ts` (eksporty)

**Subagent #2 — admin** (worktree `wt-admin`):
- Tworzone: `packages/unisource-sdk/src/v2/resources/admin.ts`, `packages/unisource-sdk/src/v2/admin-schemas.ts`, `packages/unisource-sdk/src/v2/__tests__/admin.test.ts`
- Modyfikowane: `packages/unisource-sdk/src/v2/client.ts` (dodaj `readonly admin`), `packages/unisource-sdk/src/v2/index.ts` (eksporty)

**Subagent #3 — public** (worktree `wt-public`):
- Tworzone: `packages/unisource-sdk/src/v2/resources/public.ts`, `packages/unisource-sdk/src/v2/public-schemas.ts`, `packages/unisource-sdk/src/v2/__tests__/public.test.ts`
- Modyfikowane: `packages/unisource-sdk/src/v2/client.ts` (dodaj `readonly public`), `packages/unisource-sdk/src/v2/index.ts` (eksporty)

---

## Spis zadań

### Etap 1.A — Fundament (sekwencyjnie, executing-plans)

1. **SDK error codes** — utworzyć `error-codes.ts` z `V2_ERROR_CODES`, typem, `isV2ErrorCode` + testy
2. **SDK errors refactor** — `code: V2ErrorCode | 'unknown'`, `rawCode?: string`
3. **SDK transport — auth modes** — `apiKey` ścieżka, `auth: 'none'` per-request, walidacja both
4. **SDK transport — error parser** — known→V2ErrorCode, unknown→'unknown'+rawCode
5. **SDK bulk schema** — `v2BulkFailureSchema`, `v2BulkResponseSchema` + testy parsowania
6. **Backend error codes** — utworzyć `error-codes.ts` z tą samą listą (osobna kopia)
7. **Backend errors refactor** — import `V2ErrorCode` z lokalnego `error-codes.ts`
8. **Backend/SDK contract test** — porównanie list V2_ERROR_CODES
9. **Checkpoint testów** — 3 buildy/testy zielone przed kontynuacją
10. **Backend `POST /v2/files/bulk`** — usunięcie `files.legacy.ts`, DB refactor, jeden endpoint z discriminated union
11. **SDK `client.files.bulk*` update** — nowy URL `/v2/files/bulk`, nowy body shape z `action`, nowy response schema
12. **Backend `POST /v2/folders/bulk`** — DB refactor + endpoint z cycle prevention dla move
13. **SDK `client.folders.bulk*` update** — analogicznie do Task 11, dla folders
14. **Edge cases tests** — partial success, limit 100 IDs, cross-cutting cases (cycle prevention już testowany w Task 12)
15. **Full verify** — SDK build, SDK test, backend test (wszystkie zielone)
16. **Commit i push do `beta`** — końcowe commity Etapu 1.A

### Etap 1.B — Zasoby SDK (3 subagenty równolegle, subagent-driven-development)

17. **Subagent #1** — folders CRUD + `client.myFiles` w worktree `wt-folders-myfiles`
18. **Subagent #2** — `client.admin` (11 metod) w worktree `wt-admin`
19. **Subagent #3** — `client.public` (3 metody, `auth: 'none'`) w worktree `wt-public`

### Workflow orkiestratora po Etapie 1.B

20. **Merge subagent worktrees** — scal zmiany do `beta` (resolwa konfliktów na `client.ts` i `index.ts`)
21. **Full build/test** — SDK build + SDK test + backend test
22. **Changeset SDK** — minor bump z notatką BREAKING in V2 beta
23. **Update V2_MIGRATION.md** — liczby metod, checkboxy, known limitations
24. **Code review + finishing branch** — `superpowers:requesting-code-review` + `superpowers:finishing-a-development-branch`

---

## Konwencje commitów (z CLAUDE.md)

- `feat(sdk):`, `fix(sdk):`, `refactor(sdk):`, `test(sdk):`
- `feat(backend):`, `fix(backend):`, `refactor(backend):`, `test(backend):`
- `chore(root):`, `docs(...):`
- Add `!` for breaking changes (np. `feat(sdk)!:`)
- Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com> (zgodnie ze stylem repo)

---

## Decyzje architektoniczne — szybkie przypomnienie ze specu

- **D1 Bulk envelope:** `{ processed: string[], failed: Array<{id, code, message}> }`. Stary flat shape zostaje TYLKO w `legacy-draft.ts` dla deprecated `UnisourceClient.v2.*`.
- **D2 Auth:** `apiKey?` + `getToken?` w configu, oba podane → throw, oba przez `Authorization: Bearer`. Plus per-request `auth: 'none' | 'default'` w `V2RequestOptions`.
- **D3 V2ErrorCode:** `as const` array. **Dwie kopie** (SDK + backend), **NIE wzajemny import**. Contract test pilnuje synchronizacji. `code: V2ErrorCode | 'unknown'`, `rawCode?: string`.
- **D4 Bulk endpoint:** `POST /v2/<resource>/bulk` z discriminated union body po `action: 'trash' | 'restore' | 'move' | 'delete'`. `move` wymaga JAWNEGO `folder_id`/`parent_id` (`null` = root, ale musi być w body). Cycle prevention w folders zwraca `code: 'conflict'` (NIE `cycle_detected`).

---

## Szczegółowe zadania — Etap 1.A (Fundament)

### Task 1: SDK error codes — `V2_ERROR_CODES`, `V2ErrorCode`, `isV2ErrorCode`

**Files:**
- Create: `packages/unisource-sdk/src/v2/error-codes.ts`
- Test: `packages/unisource-sdk/tests/v2/error-codes.test.ts`

- [ ] **Step 1: Write the failing test**

Utwórz `packages/unisource-sdk/tests/v2/error-codes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { V2_ERROR_CODES, isV2ErrorCode, type V2ErrorCode } from '../../src/v2/error-codes'

describe('V2_ERROR_CODES', () => {
  it('contains the closed set of 11 known codes', () => {
    expect(V2_ERROR_CODES).toEqual([
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
    ])
  })

  it('is readonly tuple (as const)', () => {
    // typeof V2_ERROR_CODES[number] is V2ErrorCode literal union
    const code: V2ErrorCode = 'not_found'
    expect(code).toBe('not_found')
  })
})

describe('isV2ErrorCode', () => {
  it('returns true for known codes', () => {
    expect(isV2ErrorCode('not_found')).toBe(true)
    expect(isV2ErrorCode('conflict')).toBe(true)
    expect(isV2ErrorCode('validation_error')).toBe(true)
  })

  it('returns false for unknown codes', () => {
    expect(isV2ErrorCode('not_a_code')).toBe(false)
    expect(isV2ErrorCode('')).toBe(false)
    expect(isV2ErrorCode('cycle_detected')).toBe(false) // intentionally NOT in list
  })

  it('narrows the type correctly', () => {
    const x: string = 'not_found'
    if (isV2ErrorCode(x)) {
      // x is now V2ErrorCode in this branch
      const code: V2ErrorCode = x
      expect(code).toBe('not_found')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @unisource/sdk test -- error-codes
```

Expected: FAIL with module-not-found error for `../../src/v2/error-codes`.

- [ ] **Step 3: Implement `error-codes.ts`**

Utwórz `packages/unisource-sdk/src/v2/error-codes.ts`:

```ts
/**
 * Closed set of V2 error codes. Mirror of apps/backend/src/lib/v2/error-codes.ts.
 * Synchronization is enforced by the contract test in apps/backend/test/v2-error-codes.contract.test.ts.
 */
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
] as const

export type V2ErrorCode = typeof V2_ERROR_CODES[number]

export function isV2ErrorCode(x: string): x is V2ErrorCode {
  return (V2_ERROR_CODES as readonly string[]).includes(x)
}
```

- [ ] **Step 4: Export from SDK barrel**

Dodaj do `packages/unisource-sdk/src/v2/index.ts` (wkomponuj w istniejące exports, np. obok eksportu z `errors.ts`):

```ts
export { V2_ERROR_CODES, isV2ErrorCode } from './error-codes'
export type { V2ErrorCode } from './error-codes'
```

- [ ] **Step 5: Run test to verify it passes**

```
pnpm --filter @unisource/sdk test -- error-codes
```

Expected: PASS (3 tests w `V2_ERROR_CODES`, 3 tests w `isV2ErrorCode`).

- [ ] **Step 6: Commit**

```bash
git add packages/unisource-sdk/src/v2/error-codes.ts \
        packages/unisource-sdk/src/v2/index.ts \
        packages/unisource-sdk/tests/v2/error-codes.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk): add V2_ERROR_CODES with isV2ErrorCode helper

V2 error codes are now a shared, type-checked closed set. SDK has its
own copy that mirrors the backend; synchronization will be enforced
by a contract test (added in a later commit).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: SDK errors refactor — `code: V2ErrorCode | 'unknown'`, `rawCode?`

**Files:**
- Modify: `packages/unisource-sdk/src/v2/errors.ts`
- Test (extend): `packages/unisource-sdk/tests/v2/transport.test.ts` (lub nowy plik dla error parsingu w Tasku 4)

- [ ] **Step 1: Read current `errors.ts`**

Otwórz `packages/unisource-sdk/src/v2/errors.ts`. Aktualna treść:

```ts
export class UnisourceV2Error extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'UnisourceV2Error'
  }
}
```

- [ ] **Step 2: Replace with new shape**

Zastąp całość pliku `packages/unisource-sdk/src/v2/errors.ts`:

```ts
import type { V2ErrorCode } from './error-codes'

export class UnisourceV2Error extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: V2ErrorCode | 'unknown',
    public readonly requestId: string,
    public readonly details?: unknown,
    /**
     * Original code string from backend when it was not a known V2ErrorCode.
     * Useful for debugging when SDK is older than backend.
     */
    public readonly rawCode?: string
  ) {
    super(message)
    this.name = 'UnisourceV2Error'
  }
}
```

- [ ] **Step 3: Type-check (no test yet — parser logic comes in Task 4)**

```
pnpm --filter @unisource/sdk typecheck
```

Expected: PASS. Jeśli istnieją inne moduły konstruujące `UnisourceV2Error` ze stringiem jako `code`, TypeScript zgłosi błąd — to oczekiwane, naprawimy w Tasku 4 (parser w `transport.ts`).

> **Pułapka:** jeśli typecheck zgłasza błędy w `transport.ts` (linia ~85, `code: body.error?.code ?? 'unknown'`), nie naprawiaj ich tutaj — to celowe, Task 4 to obsłuży. Dla teraz możesz tymczasowo dodać `as V2ErrorCode | 'unknown'` cast w `transport.ts` żeby buildy przechodziły do końca Taska 4.

- [ ] **Step 4: Commit**

```bash
git add packages/unisource-sdk/src/v2/errors.ts
git commit -m "$(cat <<'EOF'
refactor(sdk): type V2 error code with V2ErrorCode | 'unknown'

UnisourceV2Error.code is now typed against the closed V2ErrorCode set.
Forward-compatibility: new backend codes fall back to 'unknown' with
the original string preserved as rawCode for debugging.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SDK transport — auth modes (`apiKey`, `auth: 'none'`, walidacja both)

**Files:**
- Modify: `packages/unisource-sdk/src/v2/client.ts` (dodaj `apiKey?` w configu, walidacja w constructorze)
- Modify: `packages/unisource-sdk/src/v2/transport.ts` (`auth?: V2AuthMode`, ścieżka apiKey)
- Test: `packages/unisource-sdk/tests/v2/transport-auth.test.ts`

- [ ] **Step 1: Write the failing test for auth modes**

Utwórz `packages/unisource-sdk/tests/v2/transport-auth.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { UnisourceV2Client } from '../../src/v2/client'
import { createV2Request } from '../../src/v2/transport'

const okResponse = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

const dummyParser = z.object({ ok: z.boolean() })

describe('UnisourceV2Client constructor — credential mutual exclusion', () => {
  it('throws when both apiKey and getToken are provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      getToken: () => 'jwt',
      silentBeta: true,
    })).toThrow('UnisourceV2Client: provide either apiKey or getToken, not both')
  })

  it('does NOT throw when only apiKey is provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_xxx',
      silentBeta: true,
    })).not.toThrow()
  })

  it('does NOT throw when only getToken is provided', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt',
      silentBeta: true,
    })).not.toThrow()
  })

  it('does NOT throw when neither is provided (anonymous mode)', () => {
    expect(() => new UnisourceV2Client({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })).not.toThrow()
  })
})

describe('createV2Request — Authorization header', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('sends Bearer ${apiKey} when apiKey is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_static',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer key_static')
    expect(headers['X-Service-ID']).toBe('svc')
  })

  it('sends Bearer ${getToken()} when getToken is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer jwt_token')
  })

  it('does NOT send Authorization when neither apiKey nor getToken is configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })
    await request('GET', '/v2/files', { parser: dummyParser })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT send Authorization when auth: "none" is set per-request, even with apiKey configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key_static',
      silentBeta: true,
    })
    await request('GET', '/public/abc', { parser: dummyParser, auth: 'none' })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })

  it('does NOT send Authorization when auth: "none" is set per-request, even with getToken configured', async () => {
    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      getToken: () => 'jwt_token',
      silentBeta: true,
    })
    await request('GET', '/public/abc', { parser: dummyParser, auth: 'none' })

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @unisource/sdk test -- transport-auth
```

Expected: FAIL — constructor nie sprawdza both, transport nie obsługuje `apiKey` ani `auth: 'none'`.

- [ ] **Step 3: Update `client.ts` — add `apiKey?` and validation**

Zastąp `packages/unisource-sdk/src/v2/client.ts`:

```ts
import { createV2Request } from './transport'
import { createAppResource } from './resources/app'
import { createFilesResource } from './resources/files'
import { createFoldersResource } from './resources/folders'
import { createMainStorageResource } from './resources/main-storage'
import { createShareLinksResource } from './resources/share-links'
import { createSharesResource } from './resources/shares'
import { createUserFilesResource } from './resources/user-files'

let warned = false

export interface UnisourceV2ClientConfig {
  baseUrl: string
  serviceId: string
  /**
   * JWT/user auth: token fetched per request (frontend, auto-refresh).
   * Mutually exclusive with apiKey.
   */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>
  /**
   * API key auth: static secret from env (server-to-server, no refresh).
   * Mutually exclusive with getToken.
   */
  apiKey?: string
  /** Set to true to suppress the beta warning in console */
  silentBeta?: boolean
}

export class UnisourceV2Client {
  readonly files: ReturnType<typeof createFilesResource>
  readonly shares: ReturnType<typeof createSharesResource>
  readonly app: ReturnType<typeof createAppResource>
  readonly shareLinks: ReturnType<typeof createShareLinksResource>
  readonly folders: ReturnType<typeof createFoldersResource>
  readonly mainStorage: ReturnType<typeof createMainStorageResource>
  readonly userFiles: ReturnType<typeof createUserFilesResource>

  constructor(config: UnisourceV2ClientConfig) {
    if (config.apiKey && config.getToken) {
      throw new Error(
        'UnisourceV2Client: provide either apiKey or getToken, not both'
      )
    }

    if (!warned && !config.silentBeta) {
      console.warn(
        '[unisource-sdk] V2 API is in beta. Breaking changes possible. ' +
        'See https://docs.unisource.example/v2 for stability commitments.'
      )
      warned = true
    }

    const request = createV2Request(config)
    this.files = createFilesResource(request)
    this.shares = createSharesResource(request)
    this.app = createAppResource(request)
    this.shareLinks = createShareLinksResource(request)
    this.folders = createFoldersResource(request)
    this.mainStorage = createMainStorageResource(request)
    this.userFiles = createUserFilesResource(request)
  }
}
```

- [ ] **Step 4: Update `transport.ts` — `auth?: V2AuthMode` and apiKey path**

Zastąp `packages/unisource-sdk/src/v2/transport.ts`:

```ts
import type { UnisourceV2ClientConfig } from './client'
import type { V2ErrorCode } from './error-codes'
import { isV2ErrorCode } from './error-codes'
import { UnisourceV2Error } from './errors'

export type V2HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type V2AuthMode = 'default' | 'none'

export type V2Query = object

export interface V2ResponseParser<T> {
  parse: (value: unknown) => T
}

export interface V2RequestOptions<T> {
  body?: unknown
  query?: V2Query
  signal?: AbortSignal
  asUser?: string
  /**
   * Override authentication for this request.
   * - 'default' (or omitted): use apiKey or getToken from client config.
   * - 'none': do NOT send Authorization header, even if credentials are configured.
   *   Used by client.public.* for anonymous endpoints.
   */
  auth?: V2AuthMode
  parser: V2ResponseParser<T>
}

export type V2Request = <T>(
  method: V2HttpMethod,
  path: string,
  options: V2RequestOptions<T>
) => Promise<T>

type V2ErrorBody = { error?: { code?: string; message?: string; details?: unknown } }

function parseErrorBody(value: unknown): V2ErrorBody {
  if (!value || typeof value !== 'object') return {}

  const error = (value as { error?: unknown }).error
  if (!error || typeof error !== 'object') return {}

  const payload = error as Record<string, unknown>
  return {
    error: {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      details: payload.details,
    },
  }
}

async function resolveAuthHeader(
  config: UnisourceV2ClientConfig,
  authMode: V2AuthMode
): Promise<string | undefined> {
  if (authMode === 'none') return undefined
  if (config.apiKey) return `Bearer ${config.apiKey}`
  if (config.getToken) {
    const token = await config.getToken()
    if (token) return `Bearer ${token}`
  }
  return undefined
}

export function createV2Request(config: UnisourceV2ClientConfig): V2Request {
  return async function request<T>(
    method: V2HttpMethod,
    path: string,
    options: V2RequestOptions<T>
  ): Promise<T> {
    const authMode: V2AuthMode = options.auth ?? 'default'
    const authHeader = await resolveAuthHeader(config, authMode)

    const headers: Record<string, string> = {
      'X-Service-ID': config.serviceId,
    }
    if (authHeader) headers['Authorization'] = authHeader
    if (options.asUser) headers['X-Target-User-ID'] = options.asUser
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    const url = new URL(path, config.baseUrl)
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue
        url.searchParams.set(key, value === null ? 'null' : String(value))
      }
    }

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      })
    } catch (err) {
      throw new Error(`Network request failed: ${err}`)
    }

    if (!response.ok) {
      const requestId = response.headers.get('X-Request-Id') ?? 'unknown'
      let body: V2ErrorBody
      try { body = parseErrorBody(await response.json()) } catch { body = {} }

      const rawCode = body.error?.code
      const code: V2ErrorCode | 'unknown' =
        rawCode && isV2ErrorCode(rawCode) ? rawCode : 'unknown'
      const rawCodeForError = code === 'unknown' && rawCode ? rawCode : undefined

      throw new UnisourceV2Error(
        body.error?.message ?? response.statusText,
        response.status,
        code,
        requestId,
        body.error?.details,
        rawCodeForError
      )
    }

    const data = await response.json()
    return options.parser.parse(data)
  }
}
```

- [ ] **Step 5: Run auth tests to verify they pass**

```
pnpm --filter @unisource/sdk test -- transport-auth
```

Expected: PASS (4 constructor tests + 5 Authorization-header tests).

- [ ] **Step 6: Run full SDK build to confirm no regression**

```
pnpm --filter @unisource/sdk build
```

Expected: build succeeds. Jeśli nie — sprawdź czy żaden istniejący resource nie używa starego shape `code: string` w tworzeniu `UnisourceV2Error`. Powinny używać tylko parsera w `transport.ts`, ale jeśli jest gdzieś bezpośrednia konstrukcja, naprawi.

- [ ] **Step 7: Commit**

```bash
git add packages/unisource-sdk/src/v2/client.ts \
        packages/unisource-sdk/src/v2/transport.ts \
        packages/unisource-sdk/tests/v2/transport-auth.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk): support apiKey auth and per-request auth: 'none'

UnisourceV2ClientConfig now accepts apiKey for server-to-server static
credential. Mutually exclusive with getToken — constructor throws when
both are provided.

V2RequestOptions gains optional auth: 'default' | 'none' to suppress
Authorization for anonymous endpoints (client.public.*).

Error parser now narrows backend code against V2ErrorCode list,
falling back to 'unknown' with rawCode preserved for forward-compat.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: SDK transport — error parser tests (known/unknown/rawCode)

> Logic was already implemented in Task 3 (parser narrowing). Task 4 adds dedicated tests for the parser behavior with known and unknown codes.

**Files:**
- Test: `packages/unisource-sdk/tests/v2/transport-error-parsing.test.ts`

- [ ] **Step 1: Write the failing test**

Utwórz `packages/unisource-sdk/tests/v2/transport-error-parsing.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import { createV2Request } from '../../src/v2/transport'
import { UnisourceV2Error } from '../../src/v2/errors'

const dummyParser = z.object({ ok: z.boolean() })

function errorResponse(status: number, body: unknown, requestId = 'req_test_1'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  })
}

describe('createV2Request — error parsing', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('preserves a known V2ErrorCode in error.code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(404, {
      error: { code: 'not_found', message: 'File not found' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    await expect(request('GET', '/v2/files/123', { parser: dummyParser }))
      .rejects.toMatchObject({
        name: 'UnisourceV2Error',
        status: 404,
        code: 'not_found',
        message: 'File not found',
        requestId: 'req_test_1',
        rawCode: undefined,
      })
  })

  it('maps unknown backend code to "unknown" and preserves rawCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(418, {
      error: { code: 'teapot_error', message: 'I am a teapot' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    let caught: UnisourceV2Error | undefined
    try {
      await request('GET', '/v2/files', { parser: dummyParser })
    } catch (e) {
      caught = e as UnisourceV2Error
    }

    expect(caught).toBeInstanceOf(UnisourceV2Error)
    expect(caught?.code).toBe('unknown')
    expect(caught?.rawCode).toBe('teapot_error')
    expect(caught?.message).toBe('I am a teapot')
  })

  it('maps missing code to "unknown" with no rawCode', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(500, {
      error: { message: 'Server boom' },
    })))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      apiKey: 'key',
      silentBeta: true,
    })

    let caught: UnisourceV2Error | undefined
    try {
      await request('GET', '/v2/files', { parser: dummyParser })
    } catch (e) {
      caught = e as UnisourceV2Error
    }

    expect(caught?.code).toBe('unknown')
    expect(caught?.rawCode).toBeUndefined()
  })

  it('uses requestId from X-Request-Id header', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse(401, {
      error: { code: 'unauthorized', message: 'No token' },
    }, 'req_xyz_42')))

    const request = createV2Request({
      baseUrl: 'https://api.example.com',
      serviceId: 'svc',
      silentBeta: true,
    })

    await expect(request('GET', '/v2/files', { parser: dummyParser }))
      .rejects.toMatchObject({ requestId: 'req_xyz_42' })
  })
})
```

- [ ] **Step 2: Run test to verify it passes (parser already implemented in Task 3)**

```
pnpm --filter @unisource/sdk test -- transport-error-parsing
```

Expected: PASS (4 tests). Jeśli nie — wróć do Task 3 step 4 i sprawdź logikę `rawCode` w parserze.

- [ ] **Step 3: Commit**

```bash
git add packages/unisource-sdk/tests/v2/transport-error-parsing.test.ts
git commit -m "$(cat <<'EOF'
test(sdk): cover V2 error parser known/unknown/rawCode paths

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: SDK bulk schema — `v2BulkResponseSchema`

**Files:**
- Create: `packages/unisource-sdk/src/v2/bulk-schemas.ts`
- Test: `packages/unisource-sdk/tests/v2/bulk-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Utwórz `packages/unisource-sdk/tests/v2/bulk-schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { v2BulkResponseSchema, v2BulkFailureSchema } from '../../src/v2/bulk-schemas'

describe('v2BulkResponseSchema', () => {
  it('parses a valid response with processed and failed', () => {
    const body = {
      processed: ['file_a', 'file_b'],
      failed: [
        { id: 'file_c', code: 'not_found', message: 'File not found' },
        { id: 'file_d', code: 'conflict', message: 'Already in trash' },
      ],
    }
    const parsed = v2BulkResponseSchema.parse(body)
    expect(parsed).toEqual(body)
  })

  it('parses a response with empty failed array', () => {
    const body = { processed: ['a', 'b', 'c'], failed: [] }
    expect(v2BulkResponseSchema.parse(body)).toEqual(body)
  })

  it('parses a response with empty processed array', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'not_found', message: 'gone' }],
    }
    expect(v2BulkResponseSchema.parse(body)).toEqual(body)
  })

  it('rejects a failure entry with unknown code', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'teapot', message: 'wat' }],
    }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })

  it('rejects when processed is not an array', () => {
    const body = { processed: 'nope', failed: [] }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })

  it('rejects a failure entry without message', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'not_found' }],
    }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })
})

describe('v2BulkFailureSchema', () => {
  it('parses a single failure entry', () => {
    const f = { id: 'file_x', code: 'conflict', message: 'busy' }
    expect(v2BulkFailureSchema.parse(f)).toEqual(f)
  })

  it('rejects empty id', () => {
    expect(() => v2BulkFailureSchema.parse({ id: '', code: 'not_found', message: 'm' }))
      .toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @unisource/sdk test -- bulk-schemas
```

Expected: FAIL — module-not-found.

- [ ] **Step 3: Implement `bulk-schemas.ts`**

Utwórz `packages/unisource-sdk/src/v2/bulk-schemas.ts`:

```ts
import { z } from 'zod'
import { V2_ERROR_CODES } from './error-codes'

const v2ErrorCodeSchema = z.enum(V2_ERROR_CODES)

export const v2BulkFailureSchema = z.object({
  id: z.string().min(1),
  code: v2ErrorCodeSchema,
  message: z.string(),
})
export type V2BulkFailure = z.infer<typeof v2BulkFailureSchema>

export const v2BulkResponseSchema = z.object({
  processed: z.array(z.string().min(1)),
  failed: z.array(v2BulkFailureSchema),
})
export type V2BulkResponse = z.infer<typeof v2BulkResponseSchema>
```

- [ ] **Step 4: Export from SDK barrel**

Dodaj do `packages/unisource-sdk/src/v2/index.ts`:

```ts
export { v2BulkResponseSchema, v2BulkFailureSchema } from './bulk-schemas'
export type { V2BulkResponse, V2BulkFailure } from './bulk-schemas'
```

- [ ] **Step 5: Run tests**

```
pnpm --filter @unisource/sdk test -- bulk-schemas
```

Expected: PASS (8 tests across both describe blocks).

- [ ] **Step 6: Commit**

```bash
git add packages/unisource-sdk/src/v2/bulk-schemas.ts \
        packages/unisource-sdk/src/v2/index.ts \
        packages/unisource-sdk/tests/v2/bulk-schemas.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk): add V2 bulk response schema (processed + failed[])

New canonical bulk shape: { processed: string[], failed: [{ id, code, message }] }.
Failure code is type-narrowed against V2_ERROR_CODES so a backend
mistakenly returning an unknown code is caught by zod parsing.

The legacy flat shape { success, processed_count, failed_ids? } stays
in legacy-draft.ts for the deprecated UnisourceClient.v2.* namespace.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Backend error codes — `V2_ERROR_CODES` (osobna kopia)

**Files:**
- Create: `apps/backend/src/lib/v2/error-codes.ts`

- [ ] **Step 1: Implement backend `error-codes.ts`**

Utwórz `apps/backend/src/lib/v2/error-codes.ts` z **identyczną listą** jak w SDK (Task 1):

```ts
/**
 * Closed set of V2 error codes — backend copy.
 * MUST stay in sync with packages/unisource-sdk/src/v2/error-codes.ts.
 * Synchronization is enforced by apps/backend/test/lib/v2/error-codes.contract.test.ts.
 *
 * DO NOT import from @unisource/sdk here. The SDK is a downstream consumer
 * of the backend wire contract; mirroring with a contract test prevents
 * cyclic type dependencies.
 */
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
] as const

export type V2ErrorCode = typeof V2_ERROR_CODES[number]
```

- [ ] **Step 2: Type-check**

```
pnpm --filter backend typecheck
```

Expected: PASS — to czysto declarative file, brak runtime testów na tym etapie. (Contract test jest w Tasku 8.)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/lib/v2/error-codes.ts
git commit -m "$(cat <<'EOF'
feat(backend): introduce V2_ERROR_CODES as separate backend copy

Backend keeps its own copy of the V2 error code closed set. SDK has
its own copy; a contract test (added in a follow-up commit) enforces
they stay identical. This avoids cyclic type dependencies between
backend and the published SDK package.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Backend errors refactor — import `V2ErrorCode` z lokalnego `error-codes.ts`

**Files:**
- Modify: `apps/backend/src/lib/v2/errors.ts`

- [ ] **Step 1: Read current `errors.ts`**

Otwórz `apps/backend/src/lib/v2/errors.ts`. Aktualnie definiuje union type lokalnie:

```ts
export type V2ErrorCode =
  | 'validation_error'
  | 'cursor_invalid'
  // ... 9 more
```

- [ ] **Step 2: Replace local union with import from `error-codes.ts`**

Zastąp `apps/backend/src/lib/v2/errors.ts`:

```ts
import type { Context } from 'hono'
import type { V2ErrorCode } from './error-codes'

export type { V2ErrorCode }

export class V2Error extends Error {
  constructor(
    public readonly code: V2ErrorCode,
    public readonly status: number,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message ?? code)
    this.name = 'V2Error'
  }
}

export interface V2ErrorBody {
  error: {
    code: V2ErrorCode
    message: string
    details?: unknown
    request_id: string
  }
}

export function errorResponse(c: Context, error: V2Error): Response {
  const body: V2ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      request_id: c.var.requestId ?? 'unknown',
    },
  }

  if (error.details !== undefined) {
    body.error.details = error.details
  }

  return c.json(body, error.status as any)
}
```

> **Uwaga:** `export type { V2ErrorCode }` na początku zachowuje publiczny re-export, więc istniejące importy `import type { V2ErrorCode } from '../lib/v2/errors'` nadal działają. NIE zmieniaj importów w innych plikach backendu — to refactor tylko źródła typu.

- [ ] **Step 3: Type-check + run istniejące testy backendu**

```
pnpm --filter backend typecheck
pnpm --filter backend test -- --run errors
```

Expected: typecheck PASS, istniejące testy errors (jeśli są) PASS. Nie ma jeszcze nowego contract testu — jest w Tasku 8.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/lib/v2/errors.ts
git commit -m "$(cat <<'EOF'
refactor(backend): source V2ErrorCode from lib/v2/error-codes.ts

V2Error and V2ErrorBody now consume V2ErrorCode from the new
error-codes.ts module. Public type export is preserved via re-export
so existing imports keep working.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Backend ⇄ SDK contract test for `V2_ERROR_CODES`

**Files:**
- Test: `apps/backend/test/lib/v2/error-codes.contract.test.ts`

- [ ] **Step 1: Write the test**

Utwórz `apps/backend/test/lib/v2/error-codes.contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { V2_ERROR_CODES as backendCodes } from '../../../src/lib/v2/error-codes'
import { V2_ERROR_CODES as sdkCodes } from '@unisource/sdk/v2'

describe('V2_ERROR_CODES contract — backend ⇄ SDK', () => {
  it('have identical length', () => {
    expect(backendCodes.length).toBe(sdkCodes.length)
  })

  it('contain identical sets of codes', () => {
    expect(new Set(backendCodes)).toEqual(new Set(sdkCodes))
  })

  it('are byte-identical when sorted', () => {
    const sortedBackend = [...backendCodes].sort()
    const sortedSdk = [...sdkCodes].sort()
    expect(sortedBackend).toEqual(sortedSdk)
  })

  it('are at the same positions (order preserved)', () => {
    // Order is meaningful: it dictates the type layout. Drift would surprise readers.
    expect([...backendCodes]).toEqual([...sdkCodes])
  })
})
```

- [ ] **Step 2: Run the contract test**

```
pnpm --filter backend test -- --run error-codes.contract
```

Expected: PASS (4 tests). Jeśli FAIL — różnice między backend a SDK list (kolejność, treść). Wyrównać tak, by oba były identyczne.

> **Pułapka:** vitest pool workers wymaga że SDK jest zbudowany (`pnpm --filter @unisource/sdk build`), bo backend test importuje `@unisource/sdk/v2` jako paczkę. `apps/backend/package.json` ma już `pretest: pnpm run prepare:sdk`, więc to się zadzieje automatycznie. Jeśli prepare-sdk failuje — najpierw uruchom `pnpm --filter @unisource/sdk build` ręcznie.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/test/lib/v2/error-codes.contract.test.ts
git commit -m "$(cat <<'EOF'
test(backend): contract test enforces V2_ERROR_CODES sync with SDK

Mirrors the closed error code set between backend and SDK without
introducing a cyclic type dependency. Failing this test means SDK
and backend disagree on the wire contract — fix the drift before
merging.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Checkpoint — verify foundation before bulk endpoint work

> Ten task NIE pisze kodu. To jest punkt kontrolny — wszystkie zmiany fundamentu (zadania 1-8) muszą być zielone PRZED rozpoczęciem rewrite'u bulk endpointów (zadania 10-13). Jeśli któryś krok poniżej fail — zatrzymać się, naprawić, dopiero potem ruszyć dalej.

- [ ] **Step 1: Build SDK**

```
pnpm --filter @unisource/sdk build
```

Expected: PASS. Wszystkie nowe moduły (`error-codes.ts`, `bulk-schemas.ts`) i modyfikacje (`errors.ts`, `transport.ts`, `client.ts`, `index.ts`) kompilują się.

- [ ] **Step 2: Run all SDK tests**

```
pnpm --filter @unisource/sdk test
```

Expected: PASS. W szczególności:
- `error-codes.test.ts` — 6 tests pass
- `transport-auth.test.ts` — 4 constructor + 5 Authorization tests pass
- `transport-error-parsing.test.ts` — 4 tests pass
- `bulk-schemas.test.ts` — 8 tests pass
- Wszystkie istniejące testy V2 (transport, client, files, folders, etc.) — bez regresji

- [ ] **Step 3: Run backend tests (focused on foundation changes)**

```
pnpm --filter backend test -- --run error-codes.contract
```

Expected: PASS (4 contract tests).

- [ ] **Step 4: Run full backend tests for regression check**

```
pnpm --filter backend test
```

Expected: PASS. Refactor `errors.ts` (Task 7) jest type-only (re-export), więc istniejące testy backendu nie powinny mieć regresji. Jeśli któryś test fail — sprawdź czy nie usunąłeś niechcący `export type { V2ErrorCode }` re-eksportu w Tasku 7.

- [ ] **Step 5: Mental checklist before Task 10**

Sprawdź ręcznie, że:
- [ ] `packages/unisource-sdk/src/v2/error-codes.ts` istnieje i eksportuje `V2_ERROR_CODES`, `V2ErrorCode`, `isV2ErrorCode`
- [ ] `packages/unisource-sdk/src/v2/bulk-schemas.ts` istnieje i eksportuje `v2BulkResponseSchema`
- [ ] `UnisourceV2Error.code` ma typ `V2ErrorCode | 'unknown'` z opcjonalnym `rawCode`
- [ ] `UnisourceV2ClientConfig` przyjmuje `apiKey?` i `getToken?`, oba podane → throw
- [ ] `V2RequestOptions.auth?: 'default' | 'none'` istnieje
- [ ] `apps/backend/src/lib/v2/error-codes.ts` istnieje z **tą samą** listą co SDK
- [ ] Contract test przechodzi
- [ ] `apps/backend/src/lib/v2/files.legacy.ts` **nadal istnieje** (jest usuwany w Tasku 10)

> Zatrzymaj się tutaj. Jeśli wszystkie checkboxy są zielone, można przejść do Tasku 10. **Nie zaczynaj** rewrite'u bulk endpointów z czerwonym testem.

- [ ] **Step 6: Commit checkpoint marker (optional)**

> To opcjonalny commit oznaczający koniec fundamentu. Można go pominąć i ruszyć od razu do Tasku 10.

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(root): checkpoint — V2 foundation green, ready for bulk endpoint rewrite

Foundation tasks 1-8 complete:
- SDK V2_ERROR_CODES + isV2ErrorCode
- SDK errors with V2ErrorCode | 'unknown' + rawCode
- SDK transport with apiKey + auth: 'none' + error parser narrowing
- SDK bulk envelope schema (processed + failed[])
- Backend V2_ERROR_CODES (separate copy)
- Backend V2Error sources type from local error-codes
- Contract test enforces backend ⇄ SDK sync

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Backend — `POST /v2/files/bulk` z discriminated union

**Files:**
- Modify: `apps/backend/src/db/fileRecords.ts` (refactor 3 bulk helperów)
- Delete: `apps/backend/src/routes/v2/files.legacy.ts`
- Modify: `apps/backend/src/routes/v2/index.ts` (usuń import + mount filesLegacy)
- Modify: `apps/backend/src/routes/v2/files.ts` (dodaj `POST /bulk`)
- Test: `apps/backend/test/routes/v2/files-bulk.test.ts`

#### Krok A — DB helper refactor (per-id wynik)

- [ ] **A1: Define new return shape**

W `apps/backend/src/db/fileRecords.ts` (dopisz tuż przed `bulkTrashFileRecords`, linia ~277):

```ts
export type BulkItemResult =
  | { id: string; ok: true }
  | { id: string; ok: false; code: 'not_found' | 'conflict'; message: string }

export type BulkResult = { processed: string[]; failed: Array<{ id: string; code: 'not_found' | 'conflict'; message: string }> }

function partitionBulkResults(items: BulkItemResult[]): BulkResult {
  const processed: string[] = []
  const failed: BulkResult['failed'] = []
  for (const r of items) {
    if (r.ok) processed.push(r.id)
    else failed.push({ id: r.id, code: r.code, message: r.message })
  }
  return { processed, failed }
}
```

- [ ] **A2: Refactor `bulkTrashFileRecords`**

Zastąp w `apps/backend/src/db/fileRecords.ts` (linia ~277):

```ts
export async function bulkTrashFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  // Step 1: probe — which IDs exist (active, owned by user/service)?
  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM files WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts)

  const items: BulkItemResult[] = []
  const toTrash: string[] = []
  ids.forEach((id, idx) => {
    const row = probeResults[idx].results[0]
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'File not found' })
    } else if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'File already in trash' })
    } else {
      toTrash.push(id)
    }
  })

  // Step 2: trash the ones that passed probe
  if (toTrash.length > 0) {
    const trashStmts = toTrash.map(id => db.prepare(
      `UPDATE files SET is_trashed = 1, trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(now, now, id, userId, serviceId))
    const trashResults = await db.batch(trashStmts)
    trashResults.forEach((r, idx) => {
      const id = toTrash[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'File state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

- [ ] **A3: Refactor `bulkRestoreFileRecords`**

Zastąp w `apps/backend/src/db/fileRecords.ts` (linia ~300):

```ts
export async function bulkRestoreFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM files WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts)

  const items: BulkItemResult[] = []
  const toRestore: string[] = []
  ids.forEach((id, idx) => {
    const row = probeResults[idx].results[0]
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'File not found' })
    } else if (row.is_trashed === 0) {
      items.push({ id, ok: false, code: 'conflict', message: 'File is not in trash' })
    } else {
      toRestore.push(id)
    }
  })

  if (toRestore.length > 0) {
    const stmts = toRestore.map(id => db.prepare(
      `UPDATE files SET is_trashed = 0, trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
    ).bind(now, id, userId, serviceId))
    const results = await db.batch(stmts)
    results.forEach((r, idx) => {
      const id = toRestore[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'File state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

- [ ] **A4: Refactor `bulkMoveFileRecords`**

Zastąp w `apps/backend/src/db/fileRecords.ts` (linia ~323). Move probe sprawdza istnienie pliku oraz `is_trashed=0`. Walidacja target folder już jest robiona w handlerze (przed wywołaniem helpera) — DB helper zakłada poprawny `newFolderId`:

```ts
export async function bulkMoveFileRecords(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string,
  newFolderId: string | null
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM files WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts)

  const items: BulkItemResult[] = []
  const toMove: string[] = []
  ids.forEach((id, idx) => {
    const row = probeResults[idx].results[0]
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'File not found' })
    } else if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'Cannot move a trashed file' })
    } else {
      toMove.push(id)
    }
  })

  if (toMove.length > 0) {
    const stmts = toMove.map(id => db.prepare(
      `UPDATE files SET folder_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(newFolderId, now, id, userId, serviceId))
    const results = await db.batch(stmts)
    results.forEach((r, idx) => {
      const id = toMove[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'File state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

- [ ] **A5: Update existing call-sites**

Stare 3 endpointy w `files.legacy.ts` używały `Promise<string[]>`. Te zostaną usunięte w kroku B, więc nie trzeba ich naprawiać. Sprawdź ręcznie:

```
grep -rn "bulkTrashFileRecords\|bulkRestoreFileRecords\|bulkMoveFileRecords" apps/backend/src
```

Expected: tylko `apps/backend/src/db/fileRecords.ts` (definicja) i `apps/backend/src/routes/v2/files.legacy.ts` (do usunięcia w B). Jeśli są inne — naprawić ich call-sites (forwardować nowy shape).

#### Krok B — usunięcie `files.legacy.ts`, dodanie `POST /v2/files/bulk`

- [ ] **B1: Write the failing route test**

Utwórz `apps/backend/test/routes/v2/files-bulk.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env, applyD1Migrations, SELF } from 'cloudflare:test'

async function authedPost(path: string, body: unknown, token = 'apikey:test'): Promise<Response> {
  return SELF.fetch(`https://test.local${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Service-ID': 'default',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /v2/files/bulk', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
    // Seed: insert a test API key, a user, two non-trashed files
    // (Actual seeding helpers should follow the pattern of existing
    //  apps/backend/test/main-storage-routes.test.ts — copy fixtures from there.)
  })

  it('action: "trash" — moves all valid IDs to trash', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'trash',
      ids: ['file_1', 'file_2'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      processed: ['file_1', 'file_2'],
      failed: [],
    })
  })

  it('action: "restore" — restores trashed files', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'restore',
      ids: ['file_trashed_1'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('file_trashed_1')
    expect(body.failed).toEqual([])
  })

  it('action: "move" — requires explicit folder_id (null for root)', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'move',
      ids: ['file_1'],
      folder_id: null,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('file_1')
  })

  it('action: "move" — rejects request without folder_id', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'move',
      ids: ['file_1'],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })

  it('action: "delete" — permanently removes files', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'delete',
      ids: ['file_1'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('file_1')
  })

  it('rejects unknown action', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'frobnicate',
      ids: ['file_1'],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })
})
```

> **Pułapka — seeding fixtures:** `applyD1Migrations` tylko tworzy schema. Do testów potrzebujesz wprowadzić wiersze (api_keys, services, files). Skopiuj wzorzec z `apps/backend/test/main-storage-routes.test.ts` (tam są helpery `insertTestService`, `insertTestApiKey`, `insertTestFile`). Jeśli ich nie ma — utwórz `apps/backend/test/routes/v2/__fixtures__.ts` z minimalnym setem helperów.

- [ ] **B2: Run test to verify it fails**

```
pnpm --filter backend test -- --run files-bulk
```

Expected: FAIL — endpoint `/v2/files/bulk` nie istnieje, dostaniesz 404 albo error o niepasującym route.

- [ ] **B3: Add `POST /v2/files/bulk` to `apps/backend/src/routes/v2/files.ts`**

Dopisz do `apps/backend/src/routes/v2/files.ts` (po istniejącym `filesV2.get('/', ...)`):

```ts
import { z } from 'zod'
import {
  bulkTrashFileRecords,
  bulkRestoreFileRecords,
  bulkMoveFileRecords,
  type BulkResult,
} from '../../db/fileRecords'
// (powyższy import dodaj na górze pliku, scal z istniejącymi)

import { getFolderForUser } from '../../db/folders'
import { deleteFileRecordPermanently, getFileRecordForUser } from '../../db/fileRecords'
// dopisz powyższe importy jeśli nie ma

const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(100)

const filesBulkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('trash'), ids: bulkIdsSchema }),
  z.object({ action: z.literal('restore'), ids: bulkIdsSchema }),
  z.object({
    action: z.literal('move'),
    ids: bulkIdsSchema,
    folder_id: z.string().min(1).nullable(),
  }),
  z.object({ action: z.literal('delete'), ids: bulkIdsSchema }),
])

filesV2.post('/bulk', zValidator('json', filesBulkBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const body = c.req.valid('json')
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')

  let result: BulkResult

  if (body.action === 'trash') {
    result = await bulkTrashFileRecords(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'restore') {
    result = await bulkRestoreFileRecords(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'move') {
    if (body.folder_id !== null) {
      const targetFolder = await getFolderForUser(c.env.APP_DB, body.folder_id, userId, serviceId)
      if (!targetFolder) throw new V2Error('not_found', 404, 'Target folder not found')
      if (targetFolder.is_trashed) throw new V2Error('conflict', 409, 'Cannot move into a trashed folder')
    }
    result = await bulkMoveFileRecords(c.env.APP_DB, body.ids, userId, serviceId, body.folder_id)
  } else {
    // action === 'delete' — permanent
    const items: Array<{ id: string; ok: boolean; code?: 'not_found'; message?: string }> = []
    for (const id of body.ids) {
      const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId)
      if (!record) {
        items.push({ id, ok: false, code: 'not_found', message: 'File not found' })
        continue
      }
      await deleteFileRecordPermanently(c.env.APP_DB, id, userId, serviceId)
      items.push({ id, ok: true })
    }
    result = {
      processed: items.filter(i => i.ok).map(i => i.id),
      failed: items.filter(i => !i.ok).map(i => ({
        id: i.id, code: i.code as 'not_found', message: i.message ?? '',
      })),
    }
  }

  const response = c.json(result)
  logV2Request(c, start, { route_family: 'v2.files', operation: `bulk_${body.action}` })
  return response
})
```

> **Uwaga R2 cleanup dla `delete`:** ten plan zostawia bulk `delete` jako logiczne usunięcie z D1 — fizyczny R2/Appwrite cleanup dla bulk **nie jest** w zakresie sekcji 1 (zgodnie z `api-v2-architecture.md` §7 cleanup ma być idempotent przez R2 lifecycle / Queues). Pojedynczy `DELETE /my-files/:id?permanent=true` w `fileRecords.ts` nadal robi storage cleanup; bulk path zostawia to do późniejszej iteracji. Udokumentuj w PR description.

- [ ] **B4: Remove `apps/backend/src/routes/v2/files.legacy.ts`**

```bash
git rm apps/backend/src/routes/v2/files.legacy.ts
```

- [ ] **B5: Update `apps/backend/src/routes/v2/index.ts`**

Zastąp `apps/backend/src/routes/v2/index.ts`:

```ts
import { Hono } from 'hono'
import { v2RequestIdGuard } from '../../middleware/v2RequestIdGuard'
import { v2ErrorHandler } from '../../middleware/v2Errors'
import filesV2 from './files'
import foldersV2 from './folders'

type V2Env = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const v2 = new Hono<V2Env>()

v2.use('*', v2RequestIdGuard)
v2.onError(v2ErrorHandler)

v2.route('/files', filesV2)
v2.route('/folders', foldersV2)

export default v2
```

(Usunięte: `import filesLegacy from './files.legacy'`, `v2.route('/files', filesLegacy)`. Aliasem `foldersV2Legacy` została przemianowana na `foldersV2`.)

- [ ] **B6: Run backend tests**

```
pnpm --filter backend test -- --run files-bulk
```

Expected: PASS dla 6 testów action-paths. Jeśli niektóre fail z powodu fixtures — uzupełnij seeding (krok B1 pułapka).

- [ ] **B7: Run wszystkie testy backendu — regression check**

```
pnpm --filter backend test
```

Expected: PASS. Stare testy które używały `/v2/files/bulk-trash`, `/bulk-restore`, `/bulk-move` powinny zostać usunięte (ten endpointy już nie istnieją). Jeśli takie testy są w `apps/backend/test/` — usuń je w tym samym tasku (są zastąpione przez nowy `files-bulk.test.ts`).

```
grep -rn "bulk-trash\|bulk-restore\|bulk-move" apps/backend/test 2>/dev/null
```

Każdy hit → usuń ten test.

- [ ] **B8: Commit (DB refactor + endpoint + remove legacy)**

```bash
git add apps/backend/src/db/fileRecords.ts \
        apps/backend/src/routes/v2/files.ts \
        apps/backend/src/routes/v2/index.ts \
        apps/backend/test/routes/v2/files-bulk.test.ts
git rm apps/backend/src/routes/v2/files.legacy.ts
git commit -m "$(cat <<'EOF'
feat(backend)!: consolidate /v2/files bulk into single endpoint with action

POST /v2/files/bulk now accepts a discriminated union body:
  { action: 'trash' | 'restore' | 'move' | 'delete', ids, folder_id? }

Response is the new V2 envelope { processed: string[], failed: [{id, code, message}] }
with per-id reason for failures (not_found, conflict). DB helpers
bulkTrash/Restore/MoveFileRecords now return BulkResult instead of
a successes-only string[].

Removes the three separate /v2/files/bulk-{trash,restore,move} endpoints
that lived in files.legacy.ts. The file is deleted; v2/index.ts now mounts
only files.ts for /v2/files.

BREAKING (V2 beta): bulk endpoint shape changed. V2 beta has no production
consumers — callers will be updated in the same release.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: SDK — `client.files.bulk*` update do nowego endpointu/shape

**Files:**
- Modify: `packages/unisource-sdk/src/v2/resources/files.ts`
- Modify: `packages/unisource-sdk/tests/v2/files.test.ts` (przepisać 3 describe bloki + dodać `bulk` describe)

- [ ] **Step 1: Replace `resources/files.ts` z nowym shape**

Zastąp całość `packages/unisource-sdk/src/v2/resources/files.ts`:

```ts
import type { V2BulkResponse } from '../bulk-schemas'
import { v2BulkResponseSchema } from '../bulk-schemas'
import type { V2File } from '../files'
import type { V2ListQuery, V2ListResponse } from '../types'
import { v2FilesListResponseSchema } from '../schemas'
import type { V2Request } from '../transport'

/**
 * Discriminated union for POST /v2/files/bulk body.
 * `move` requires explicit folder_id (null = root, but must be present).
 */
export type V2FilesBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; folder_id: string | null }
  | { action: 'delete'; ids: string[] }

export function createFilesResource(request: V2Request) {
  const bulk = (
    body: V2FilesBulkRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2BulkResponse> =>
    request('POST', '/v2/files/bulk', {
      body,
      signal,
      asUser: options?.asUser,
      parser: v2BulkResponseSchema,
    })

  return {
    list: (
      query?: V2ListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2ListResponse<V2File>> =>
      request('GET', '/v2/files', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2FilesListResponseSchema,
      }),

    /** Canonical bulk method — accepts a discriminated union body. */
    bulk,

    /** Convenience: delegates to bulk({ action: 'trash', ... }). */
    bulkTrash: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'trash', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'restore', ... }). */
    bulkRestore: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'restore', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'move', ... }). folder_id is required. */
    bulkMove: (
      args: { ids: string[]; folder_id: string | null },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'move', ids: args.ids, folder_id: args.folder_id }, signal, options),
  }
}
```

- [ ] **Step 2: Replace `tests/v2/files.test.ts`**

Zastąp całość `packages/unisource-sdk/tests/v2/files.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const okBulkBody = { processed: ['a', 'b'], failed: [] }

function mockOk(body: unknown = okBulkBody) {
  return vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'req-1' },
    json: () => Promise.resolve(body),
  })
}

describe('UnisourceV2Client.files.bulk (canonical)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs to /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'trash', ids: ['a'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/files/bulk',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends discriminated body for action: trash', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'trash', ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'trash', ids: ['x', 'y'] })
  })

  it('sends discriminated body for action: move with folder_id null', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'move', ids: ['a'], folder_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], folder_id: null })
    expect(body).toContain('"folder_id":null')
  })

  it('sends discriminated body for action: delete', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulk({ action: 'delete', ids: ['a'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'delete', ids: ['a'] })
  })

  it('parses { processed, failed[] } response', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: ['a', 'b'],
      failed: [{ id: 'c', code: 'not_found', message: 'gone' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.files.bulk({ action: 'trash', ids: ['a', 'b', 'c'] })
    expect(result).toEqual({
      processed: ['a', 'b'],
      failed: [{ id: 'c', code: 'not_found', message: 'gone' }],
    })
  })

  it('rejects an unknown failure code at parse time', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: [],
      failed: [{ id: 'c', code: 'teapot', message: 'wat' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulk({ action: 'trash', ids: ['c'] })).rejects.toThrow()
  })

  it('throws UnisourceV2Error with V2 code on 400 validation_error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, statusText: 'Bad Request',
      headers: { get: () => 'req-400' },
      json: () => Promise.resolve({ error: { code: 'validation_error', message: 'ids must be 1..100' } }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.files.bulk({ action: 'trash', ids: ['a'] })).rejects.toMatchObject({
      name: 'UnisourceV2Error',
      status: 400,
      code: 'validation_error',
      requestId: 'req-400',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.files.bulk({ action: 'trash', ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.files.bulkTrash (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: trash on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a', 'b'] })

    const call = vi.mocked(fetch).mock.calls[0]!
    expect(call[0]).toBe('https://api.example.com/v2/files/bulk')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'trash', ids: ['a', 'b'] })
  })

  it('forwards asUser via X-Target-User-ID', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkTrash({ ids: ['a'] }, undefined, { asUser: 'user-Z' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Target-User-ID']).toBe('user-Z')
  })
})

describe('UnisourceV2Client.files.bulkRestore (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: restore on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkRestore({ ids: ['a'] })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'restore', ids: ['a'] })
  })
})

describe('UnisourceV2Client.files.bulkMove (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: move on /v2/files/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: 'f1' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'move', ids: ['a'], folder_id: 'f1' })
  })

  it('passes folder_id: null to root', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.files.bulkMove({ ids: ['a'], folder_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], folder_id: null })
  })

  it('TypeScript: folder_id is required (compile-time guarantee)', () => {
    // This is a type-only test: the line below would fail to compile if
    // folder_id were optional. Keep it as documentation.
    // @ts-expect-error folder_id is required
    const _ = (client: UnisourceV2Client) => client.files.bulkMove({ ids: ['a'] })
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 3: Run SDK tests**

```
pnpm --filter @unisource/sdk test -- files
```

Expected: PASS — wszystkie nowe describe bloki (canonical bulk, 3 wrappery). Stare testy używające `/v2/files/bulk-trash` itp. zostały zastąpione.

- [ ] **Step 4: SDK build**

```
pnpm --filter @unisource/sdk build
```

Expected: PASS. Type-only test `@ts-expect-error` weryfikuje że `folder_id` jest required.

- [ ] **Step 5: Commit**

```bash
git add packages/unisource-sdk/src/v2/resources/files.ts \
        packages/unisource-sdk/tests/v2/files.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk)!: client.files.bulk* hits /v2/files/bulk with action body

New canonical method: client.files.bulk(args) where args is a discriminated
union { action, ids, folder_id? }. Convenience wrappers (bulkTrash,
bulkRestore, bulkMove) now delegate to bulk(...). folder_id is required
on bulkMove (null = root, but must be explicit).

Response is parsed against v2BulkResponseSchema — unknown failure codes
fail at parse time, catching backend drift before it reaches consumers.

BREAKING (V2 beta): bulk-trash, bulk-restore, bulk-move endpoints removed
from public path. V2 beta has no production consumers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Backend — `POST /v2/folders/bulk` z cycle prevention

**Files:**
- Modify: `apps/backend/src/db/folders.ts` (refactor 3 bulk helperów + cycle check)
- Modify: `apps/backend/src/routes/v2/folders.ts` (usuń stare 3 endpointy, dodaj `POST /bulk`)
- Test: `apps/backend/test/routes/v2/folders-bulk.test.ts`

#### Krok A — DB helpers refactor

- [ ] **A1: Refactor `bulkTrashFolders`**

W `apps/backend/src/db/folders.ts` (linia ~271). Reuse `BulkResult`, `BulkItemResult`, `partitionBulkResults` z `fileRecords.ts`, ale folders mają własną semantykę (trash subtree). Dla uproszczenia w sekcji 1: trash dotyczy tylko bezpośrednio wskazanych folderów (subtree trash to scope dla późniejszej iteracji `api-v2-architecture.md` §5).

Dodaj na górze `apps/backend/src/db/folders.ts` import:

```ts
import type { BulkResult, BulkItemResult } from './fileRecords'
import { partitionBulkResults } from './fileRecords'
```

> **Uwaga:** funkcja `partitionBulkResults` została zdefiniowana w Tasku 10 jako helper internal w `fileRecords.ts`. Dla reuse w `folders.ts` zmień jej eksport: `export function partitionBulkResults(...)` w `fileRecords.ts`.

Zastąp `bulkTrashFolders`:

```ts
export async function bulkTrashFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts)

  const items: BulkItemResult[] = []
  const toTrash: string[] = []
  ids.forEach((id, idx) => {
    const row = probeResults[idx].results[0]
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' })
    } else if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'Folder already in trash' })
    } else {
      toTrash.push(id)
    }
  })

  if (toTrash.length > 0) {
    const stmts = toTrash.map(id => db.prepare(
      `UPDATE folders SET is_trashed = 1, trashed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(now, now, id, userId, serviceId))
    const results = await db.batch(stmts)
    results.forEach((r, idx) => {
      const id = toTrash[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

- [ ] **A2: Refactor `bulkRestoreFolders`**

Zastąp w `apps/backend/src/db/folders.ts`:

```ts
export async function bulkRestoreFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed, parent_id FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number; parent_id: string | null }>(probeStmts)

  const items: BulkItemResult[] = []
  const toRestore: string[] = []
  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx]
    const row = probeResults[idx].results[0]
    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' })
      continue
    }
    if (row.is_trashed === 0) {
      items.push({ id, ok: false, code: 'conflict', message: 'Folder is not in trash' })
      continue
    }
    // api-v2-architecture.md §5: restore tylko gdy parent jest aktywny
    if (row.parent_id) {
      const parent = await db.prepare(
        `SELECT is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
      ).bind(row.parent_id, userId, serviceId).first<{ is_trashed: number }>()
      if (!parent || parent.is_trashed === 1) {
        items.push({ id, ok: false, code: 'conflict', message: 'Parent folder is trashed or missing' })
        continue
      }
    }
    toRestore.push(id)
  }

  if (toRestore.length > 0) {
    const stmts = toRestore.map(id => db.prepare(
      `UPDATE folders SET is_trashed = 0, trashed_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 1`
    ).bind(now, id, userId, serviceId))
    const results = await db.batch(stmts)
    results.forEach((r, idx) => {
      const id = toRestore[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

- [ ] **A3: Refactor `bulkMoveFolders` z cycle prevention**

Zastąp w `apps/backend/src/db/folders.ts`. Wykorzystuje istniejącą funkcję `getDescendantFolderIds` do wykrywania cykli per-id:

```ts
export async function bulkMoveFolders(
  db: D1Database,
  ids: string[],
  userId: string,
  serviceId: string,
  newParentId: string | null
): Promise<BulkResult> {
  if (ids.length === 0) return { processed: [], failed: [] }
  const now = Math.floor(Date.now() / 1000)

  const probeStmts = ids.map(id => db.prepare(
    `SELECT id, is_trashed FROM folders WHERE id = ? AND user_id = ? AND service_id = ?`
  ).bind(id, userId, serviceId))
  const probeResults = await db.batch<{ id: string; is_trashed: number }>(probeStmts)

  const items: BulkItemResult[] = []
  const toMove: string[] = []

  for (let idx = 0; idx < ids.length; idx++) {
    const id = ids[idx]
    const row = probeResults[idx].results[0]

    if (!row) {
      items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' })
      continue
    }
    if (row.is_trashed === 1) {
      items.push({ id, ok: false, code: 'conflict', message: 'Cannot move a trashed folder' })
      continue
    }
    if (newParentId === id) {
      items.push({ id, ok: false, code: 'conflict', message: 'Cannot move folder into itself' })
      continue
    }
    if (newParentId !== null) {
      // Cycle check: target parent must NOT be a descendant of `id`.
      const descendants = await getDescendantFolderIds(db, id, userId, serviceId)
      // descendants includes `id` itself (per existing implementation); strip it for clarity
      const descendantsExcludingSelf = descendants.filter(d => d !== id)
      if (descendantsExcludingSelf.includes(newParentId)) {
        items.push({ id, ok: false, code: 'conflict', message: 'Cycle detected: target parent is a descendant of this folder' })
        continue
      }
    }
    toMove.push(id)
  }

  if (toMove.length > 0) {
    const stmts = toMove.map(id => db.prepare(
      `UPDATE folders SET parent_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND service_id = ? AND is_trashed = 0`
    ).bind(newParentId, now, id, userId, serviceId))
    const results = await db.batch(stmts)
    results.forEach((r, idx) => {
      const id = toMove[idx]
      if ((r.meta.changes ?? 0) > 0) items.push({ id, ok: true })
      else items.push({ id, ok: false, code: 'conflict', message: 'Folder state changed concurrently' })
    })
  }

  return partitionBulkResults(items)
}
```

> **Uwaga wydajność:** `getDescendantFolderIds` per-id w pętli. Dla 100 IDs to 100 recursive CTE — dużo zapytań D1. Optymalizacja (jedno globalne CTE dla całego batchu) jest możliwa, ale nie w sekcji 1 — udokumentuj jako future work w PR description.

- [ ] **A4: Update `partitionBulkResults` export w `fileRecords.ts`**

W Tasku 10 zdefiniowałeś `partitionBulkResults` jako internal helper. Dodaj `export`:

```ts
export function partitionBulkResults(items: BulkItemResult[]): BulkResult {
  // ...same as Task 10
}
```

#### Krok B — Endpoint POST /v2/folders/bulk + remove old 3

- [ ] **B1: Write the failing route test**

Utwórz `apps/backend/test/routes/v2/folders-bulk.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { env, applyD1Migrations, SELF } from 'cloudflare:test'

async function authedPost(path: string, body: unknown, token = 'apikey:test'): Promise<Response> {
  return SELF.fetch(`https://test.local${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Service-ID': 'default',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /v2/folders/bulk', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
    // Seed: services, api keys, user, folders structure (use fixtures from
    // apps/backend/test/main-storage-routes.test.ts as template; folders need
    // a parent/child structure for cycle prevention tests).
  })

  it('action: "trash" — trashes valid folder ids', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'trash',
      ids: ['folder_a', 'folder_b'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ processed: ['folder_a', 'folder_b'], failed: [] })
  })

  it('action: "restore" — restores trashed folders', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'restore',
      ids: ['folder_trashed_1'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('folder_trashed_1')
  })

  it('action: "move" — requires explicit parent_id (null for root)', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'move',
      ids: ['folder_a'],
      parent_id: null,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('folder_a')
  })

  it('action: "move" — cycle prevention returns failed with code: conflict', async () => {
    // Setup: folder_parent has folder_child as descendant.
    // Trying to move folder_parent INTO folder_child → cycle.
    const res = await authedPost('/v2/folders/bulk', {
      action: 'move',
      ids: ['folder_parent'],
      parent_id: 'folder_child',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toEqual([])
    expect(body.failed).toEqual([
      { id: 'folder_parent', code: 'conflict', message: expect.stringContaining('Cycle') },
    ])
  })

  it('action: "move" — cannot move folder into itself', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'move',
      ids: ['folder_a'],
      parent_id: 'folder_a',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toEqual([])
    expect(body.failed[0]).toMatchObject({
      id: 'folder_a', code: 'conflict', message: expect.stringContaining('itself'),
    })
  })

  it('action: "delete" — permanently removes folders (subtree handled at handler level)', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'delete',
      ids: ['folder_a'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed).toContain('folder_a')
  })

  it('rejects unknown action', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'fold',
      ids: ['folder_a'],
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })
})
```

- [ ] **B2: Run test to verify it fails**

```
pnpm --filter backend test -- --run folders-bulk
```

Expected: FAIL — endpoint nie istnieje (3 stare są pod `/bulk-trash`/`/bulk-restore`/`/bulk-move`, ale nie pod `/bulk`).

- [ ] **B3: Modify `apps/backend/src/routes/v2/folders.ts` — usuń stare 3 endpointy, dodaj `POST /bulk`**

Wytnij linie z `foldersV2.post('/bulk-trash', ...)`, `foldersV2.post('/bulk-restore', ...)`, `foldersV2.post('/bulk-move', ...)` (linie ~112-180). Zastąp jednym handlerem:

```ts
import { z } from 'zod'
import {
  bulkTrashFolders,
  bulkRestoreFolders,
  bulkMoveFolders,
  deleteFoldersPermanently, // jeśli istnieje; jeśli nie — patrz B4
  type BulkResult,
} from '../../db/folders'

const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(100)

const foldersBulkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('trash'), ids: bulkIdsSchema }),
  z.object({ action: z.literal('restore'), ids: bulkIdsSchema }),
  z.object({
    action: z.literal('move'),
    ids: bulkIdsSchema,
    parent_id: z.string().min(1).nullable(),
  }),
  z.object({ action: z.literal('delete'), ids: bulkIdsSchema }),
])

foldersV2.post('/bulk', zValidator('json', foldersBulkBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const body = c.req.valid('json')
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')

  let result: BulkResult

  if (body.action === 'trash') {
    result = await bulkTrashFolders(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'restore') {
    result = await bulkRestoreFolders(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'move') {
    if (body.parent_id !== null) {
      const target = await getFolderForUser(c.env.APP_DB, body.parent_id, userId, serviceId)
      if (!target) throw new V2Error('not_found', 404, 'Target parent folder not found')
      if (target.is_trashed) throw new V2Error('conflict', 409, 'Cannot move into a trashed folder')
    }
    result = await bulkMoveFolders(c.env.APP_DB, body.ids, userId, serviceId, body.parent_id)
  } else {
    // action === 'delete' — permanent delete subtree per id
    const items: Array<{ id: string; ok: boolean; code?: 'not_found' | 'conflict'; message?: string }> = []
    for (const id of body.ids) {
      const descendants = await getDescendantFolderIds(c.env.APP_DB, id, userId, serviceId)
      if (descendants.length === 0) {
        items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' })
        continue
      }
      // Mark files trashed (R2 cleanup via lifecycle), batch-delete folders
      await trashFilesInFolders(c.env.APP_DB, descendants, userId, serviceId)
      const stmts = descendants.map(fid => c.env.APP_DB.prepare(
        'DELETE FROM folders WHERE id = ? AND user_id = ? AND service_id = ?'
      ).bind(fid, userId, serviceId))
      if (stmts.length > 0) await c.env.APP_DB.batch(stmts)
      items.push({ id, ok: true })
    }
    result = {
      processed: items.filter(i => i.ok).map(i => i.id),
      failed: items.filter(i => !i.ok).map(i => ({
        id: i.id, code: (i.code ?? 'not_found') as 'not_found' | 'conflict', message: i.message ?? '',
      })),
    }
  }

  const response = c.json(result)
  logV2Request(c, start, { route_family: 'v2.folders', operation: `bulk_${body.action}` })
  return response
})
```

> **Importy do scalenia z istniejącymi:** dodaj `getFolderForUser`, `getDescendantFolderIds`, `trashFilesInFolders` jeśli ich jeszcze nie ma w pliku. `getDescendantFolderIds` i `getFolderForUser` są w `apps/backend/src/db/folders.ts`. `trashFilesInFolders` jest w `apps/backend/src/db/fileRecords.ts`.

- [ ] **B4: Verify import paths**

```
grep -n "trashFilesInFolders\|deleteFoldersPermanently" apps/backend/src/db/
```

Expected: `trashFilesInFolders` istnieje w `fileRecords.ts`. `deleteFoldersPermanently` może nie istnieć — w handlerze powyżej delete jest robiony inline przez `db.batch(stmts)`. Jeśli nie istnieje, usuń import `deleteFoldersPermanently` z code'u w B3.

- [ ] **B5: Remove obsolete frozen schemas usage**

Sprawdź czy `bulkFolderIdsSchema` i `bulkFolderMoveRequestSchema` z `@unisource/sdk` są jeszcze importowane w `folders.ts`. Po usunięciu starych endpointów nie powinny być potrzebne. Usuń niepotrzebne importy:

```
# w apps/backend/src/routes/v2/folders.ts:
# import { bulkFolderIdsSchema, bulkFolderMoveRequestSchema, type BulkOperationResponse } from '@unisource/sdk'
# ↑ te 3 nie są już potrzebne
```

- [ ] **B6: Run backend tests**

```
pnpm --filter backend test -- --run folders-bulk
```

Expected: PASS dla 7 testów (4 actions + cycle + self-move + unknown action).

- [ ] **B7: Run all backend tests for regression**

```
pnpm --filter backend test
```

Expected: PASS. Stare testy używające `/v2/folders/bulk-trash` etc. — usuń je analogicznie do B7 z Tasku 10:

```
grep -rn "bulk-trash\|bulk-restore\|bulk-move" apps/backend/test
```

- [ ] **B8: Commit**

```bash
git add apps/backend/src/db/folders.ts \
        apps/backend/src/db/fileRecords.ts \
        apps/backend/src/routes/v2/folders.ts \
        apps/backend/test/routes/v2/folders-bulk.test.ts
git commit -m "$(cat <<'EOF'
feat(backend)!: consolidate /v2/folders bulk into single endpoint with action

POST /v2/folders/bulk replaces the three separate /bulk-trash, /bulk-restore,
/bulk-move endpoints. Body is a discriminated union with actions
trash | restore | move | delete; move requires explicit parent_id (null = root).

Cycle prevention now runs per-id in bulkMoveFolders: target parent_id
cannot be the moved folder itself or any of its descendants. Failures
return code: 'conflict' (NOT a new V2_ERROR_CODES entry — kept the closed
set unchanged).

Restore now requires an active parent (api-v2-architecture.md §5).
Bulk delete handles subtree cleanup at handler level (R2 cleanup is
deferred to lifecycle / Queues).

partitionBulkResults helper exported from db/fileRecords.ts so folders
DB layer can reuse it.

BREAKING (V2 beta): old folder bulk endpoints removed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: SDK — `client.folders.bulk*` update do nowego endpointu/shape

**Files:**
- Modify: `packages/unisource-sdk/src/v2/resources/folders.ts`
- Modify: `packages/unisource-sdk/tests/v2/folders.test.ts` (przepisać 3 bulk describe bloki + dodać `bulk` describe; testy `list`/`breadcrumbs` zostają)

> **Uwaga zakresu:** ten task dotyczy WYŁĄCZNIE bulk metod folders. CRUD (create, get, update, delete, restore) jest w Etapie 1.B (Subagent #1, Task 17). Tutaj zostawiamy istniejące `list`, `breadcrumbs` bez zmian, modyfikujemy tylko 3 bulk metody i dodajemy `bulk()` kanoniczny.

- [ ] **Step 1: Replace bulk-related parts of `resources/folders.ts`**

W `packages/unisource-sdk/src/v2/resources/folders.ts` zostaw `list` i `breadcrumbs` jak są. Zastąp 3 bulk metody (linie ~38-71) i dodaj `bulk` kanoniczny. Pełny zaktualizowany plik:

```ts
import type {
  V2FolderBreadcrumbsResponse,
  V2FolderListQuery,
  V2FolderListResponse,
} from '../folders'
import { v2FolderBreadcrumbsResponseSchema, v2FolderListResponseSchema } from '../folders'
import type { V2BulkResponse } from '../bulk-schemas'
import { v2BulkResponseSchema } from '../bulk-schemas'
import type { V2Request } from '../transport'

/**
 * Discriminated union for POST /v2/folders/bulk body.
 * `move` requires explicit parent_id (null = root, but must be present).
 */
export type V2FoldersBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; parent_id: string | null }
  | { action: 'delete'; ids: string[] }

export function createFoldersResource(request: V2Request) {
  const bulk = (
    body: V2FoldersBulkRequest,
    signal?: AbortSignal,
    options?: { asUser?: string }
  ): Promise<V2BulkResponse> =>
    request('POST', '/v2/folders/bulk', {
      body,
      signal,
      asUser: options?.asUser,
      parser: v2BulkResponseSchema,
    })

  return {
    list: (
      query?: V2FolderListQuery,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderListResponse> =>
      request('GET', '/v2/folders', {
        query,
        signal,
        asUser: options?.asUser,
        parser: v2FolderListResponseSchema,
      }),
    breadcrumbs: (
      id: string,
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2FolderBreadcrumbsResponse> =>
      request('GET', `/v2/folders/${encodeURIComponent(id)}/breadcrumbs`, {
        signal,
        asUser: options?.asUser,
        parser: v2FolderBreadcrumbsResponseSchema,
      }),

    /** Canonical bulk method — accepts a discriminated union body. */
    bulk,

    /** Convenience: delegates to bulk({ action: 'trash', ... }). */
    bulkTrash: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'trash', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'restore', ... }). */
    bulkRestore: (
      args: { ids: string[] },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'restore', ids: args.ids }, signal, options),

    /** Convenience: delegates to bulk({ action: 'move', ... }). parent_id is required. */
    bulkMove: (
      args: { ids: string[]; parent_id: string | null },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<V2BulkResponse> =>
      bulk({ action: 'move', ids: args.ids, parent_id: args.parent_id }, signal, options),
  }
}
```

- [ ] **Step 2: Update `tests/v2/folders.test.ts` — bulk describe bloki**

Otwórz `packages/unisource-sdk/tests/v2/folders.test.ts`. Znajdź 3 describe bloki dla `bulkTrash`/`bulkRestore`/`bulkMove`. Zastąp je analogicznym zestawem jak w `files.test.ts` z Tasku 11 — z dwoma kluczowymi różnicami:

1. URL: `/v2/folders/bulk` (nie `/v2/files/bulk`)
2. `bulkMove` używa `parent_id` (nie `folder_id`)

Konkretnie — usuń stare describe bloki (`UnisourceV2Client.folders.bulkTrash`, `UnisourceV2Client.folders.bulkRestore`, `UnisourceV2Client.folders.bulkMove`) i dodaj nowy zestaw na końcu pliku (po istniejących testach `list`/`breadcrumbs`):

```ts
describe('UnisourceV2Client.folders.bulk (canonical)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk(body: unknown = { processed: ['a'], failed: [] }) {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve(body),
    })
  }

  it('POSTs to /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'trash', ids: ['a'] })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/folders/bulk',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends discriminated body for action: trash', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'trash', ids: ['x', 'y'] })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body
    expect(JSON.parse(body as string)).toEqual({ action: 'trash', ids: ['x', 'y'] })
  })

  it('sends discriminated body for action: move with parent_id null', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulk({ action: 'move', ids: ['a'], parent_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], parent_id: null })
    expect(body).toContain('"parent_id":null')
  })

  it('parses { processed, failed[] } response', async () => {
    vi.stubGlobal('fetch', mockOk({
      processed: ['a'],
      failed: [{ id: 'b', code: 'conflict', message: 'Cycle detected' }],
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.folders.bulk({ action: 'move', ids: ['a', 'b'], parent_id: 'p1' })
    expect(result.failed[0]).toEqual({ id: 'b', code: 'conflict', message: 'Cycle detected' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.folders.bulk({ action: 'trash', ids: ['a'] }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

describe('UnisourceV2Client.folders.bulkTrash (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    })
  }

  it('delegates to bulk with action: trash on /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkTrash({ ids: ['a', 'b'] })

    const call = vi.mocked(fetch).mock.calls[0]!
    expect(call[0]).toBe('https://api.example.com/v2/folders/bulk')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'trash', ids: ['a', 'b'] })
  })
})

describe('UnisourceV2Client.folders.bulkRestore (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('delegates to bulk with action: restore on /v2/folders/bulk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    }))
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkRestore({ ids: ['a'] })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'restore', ids: ['a'] })
  })
})

describe('UnisourceV2Client.folders.bulkMove (convenience wrapper)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function mockOk() {
    return vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'req-1' },
      json: () => Promise.resolve({ processed: ['a'], failed: [] }),
    })
  }

  it('delegates to bulk with action: move and parent_id', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkMove({ ids: ['a'], parent_id: 'p1' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ action: 'move', ids: ['a'], parent_id: 'p1' })
  })

  it('passes parent_id: null to root', async () => {
    vi.stubGlobal('fetch', mockOk())
    const client = new UnisourceV2Client(mockConfig)
    await client.folders.bulkMove({ ids: ['a'], parent_id: null })
    const body = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string
    expect(JSON.parse(body)).toEqual({ action: 'move', ids: ['a'], parent_id: null })
  })

  it('TypeScript: parent_id is required', () => {
    // @ts-expect-error parent_id is required
    const _ = (client: UnisourceV2Client) => client.folders.bulkMove({ ids: ['a'] })
    expect(true).toBe(true)
  })
})
```

> Pamiętaj o `mockConfig` i istniejących importach na górze pliku — zostają jak są. Sprawdź też że `import { UnisourceV2Client } from '../../src/v2/client'` istnieje.

- [ ] **Step 3: Run SDK tests**

```
pnpm --filter @unisource/sdk test -- folders
```

Expected: PASS — wszystkie nowe describe bloki + istniejące `list`/`breadcrumbs`. Stare bulk describe (z `/v2/folders/bulk-trash` etc.) zostały usunięte.

- [ ] **Step 4: SDK build**

```
pnpm --filter @unisource/sdk build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/unisource-sdk/src/v2/resources/folders.ts \
        packages/unisource-sdk/tests/v2/folders.test.ts
git commit -m "$(cat <<'EOF'
feat(sdk)!: client.folders.bulk* hits /v2/folders/bulk with action body

Symmetric to client.files.bulk: canonical bulk(args) method plus
delegating wrappers (bulkTrash, bulkRestore, bulkMove). bulkMove requires
explicit parent_id (null = root, but must be present).

Response is parsed against v2BulkResponseSchema. Cycle prevention
errors come back in failed[] with code: 'conflict' — surfaced as data,
not exception.

BREAKING (V2 beta): old folder bulk endpoints removed from SDK paths.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Backend tests — edge cases (limit 100, partial success)

**Files:**
- Modify: `apps/backend/test/routes/v2/files-bulk.test.ts` (dodaj 2 nowe describe bloki)
- Modify: `apps/backend/test/routes/v2/folders-bulk.test.ts` (analogicznie)

> **Decyzja:** edge cases dopisujemy do istniejących plików (zamiast tworzyć osobne `*-edge-cases.test.ts`). Krótsze ścieżki, wszystkie testy bulk obok siebie.

- [ ] **Step 1: Add limit-100 + partial-success describe to files-bulk**

Dopisz do `apps/backend/test/routes/v2/files-bulk.test.ts` (poniżej istniejącego describe z Task 10):

```ts
describe('POST /v2/files/bulk — limits', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
    // (use existing fixtures helper)
  })

  it('rejects more than 100 IDs with validation_error', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `file_${i}`)
    const res = await authedPost('/v2/files/bulk', { action: 'trash', ids })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })

  it('accepts exactly 100 IDs', async () => {
    // Seed 100 files with ids file_0..file_99
    // ...seeding code per fixtures helper
    const ids = Array.from({ length: 100 }, (_, i) => `file_${i}`)
    const res = await authedPost('/v2/files/bulk', { action: 'trash', ids })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.processed.length + body.failed.length).toBe(100)
  })

  it('rejects empty ids array', async () => {
    const res = await authedPost('/v2/files/bulk', { action: 'trash', ids: [] })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })
})

describe('POST /v2/files/bulk — partial success', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
    // Seed: file_real_1, file_real_2 exist (active); file_real_3 is already trashed
  })

  it('partitions processed vs failed across mixed-state IDs', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'trash',
      ids: ['file_real_1', 'file_real_2', 'file_does_not_exist', 'file_real_3'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    // file_real_1, file_real_2 → processed (active → trashed)
    expect(body.processed).toEqual(expect.arrayContaining(['file_real_1', 'file_real_2']))
    expect(body.processed.length).toBe(2)

    // file_does_not_exist → not_found
    expect(body.failed).toEqual(expect.arrayContaining([
      { id: 'file_does_not_exist', code: 'not_found', message: expect.any(String) },
    ]))

    // file_real_3 already trashed → conflict
    expect(body.failed).toEqual(expect.arrayContaining([
      { id: 'file_real_3', code: 'conflict', message: expect.any(String) },
    ]))

    expect(body.failed.length).toBe(2)
  })

  it('move with non-existent target folder returns 404 (whole request fails)', async () => {
    const res = await authedPost('/v2/files/bulk', {
      action: 'move',
      ids: ['file_real_1'],
      folder_id: 'folder_does_not_exist',
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
  })

  it('move with trashed target folder returns 409 (whole request fails)', async () => {
    // Seed folder_trashed with is_trashed = 1
    const res = await authedPost('/v2/files/bulk', {
      action: 'move',
      ids: ['file_real_1'],
      folder_id: 'folder_trashed',
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('conflict')
  })
})
```

> **Why "whole request fails" dla missing/trashed target folder:** spec V2 §3.1 i `files.legacy.ts` (przed usunięciem w Task 10) zwracały V2Error PRZED batchem, jeśli target był niepoprawny. Per-id rozróżnienie nie ma sensu — wszystkie IDs idą do tego samego target. Zachowaliśmy ten kontrakt w Task 10 (`throw new V2Error('not_found', ...)`). Test to weryfikuje.

- [ ] **Step 2: Add limit-100 + partial-success describe to folders-bulk**

Dopisz do `apps/backend/test/routes/v2/folders-bulk.test.ts`:

```ts
describe('POST /v2/folders/bulk — limits', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
  })

  it('rejects more than 100 IDs', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `folder_${i}`)
    const res = await authedPost('/v2/folders/bulk', { action: 'trash', ids })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })

  it('rejects empty ids array', async () => {
    const res = await authedPost('/v2/folders/bulk', { action: 'trash', ids: [] })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('validation_error')
  })
})

describe('POST /v2/folders/bulk — partial success', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.APP_DB, (env as any).TEST_MIGRATIONS)
    // Seed: folder_a, folder_b active; folder_c trashed
  })

  it('partitions processed vs failed across mixed-state IDs', async () => {
    const res = await authedPost('/v2/folders/bulk', {
      action: 'trash',
      ids: ['folder_a', 'folder_b', 'folder_missing', 'folder_c'],
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.processed).toEqual(expect.arrayContaining(['folder_a', 'folder_b']))
    expect(body.processed.length).toBe(2)

    expect(body.failed).toEqual(expect.arrayContaining([
      { id: 'folder_missing', code: 'not_found', message: expect.any(String) },
      { id: 'folder_c', code: 'conflict', message: expect.any(String) },
    ]))
    expect(body.failed.length).toBe(2)
  })

  it('cycle prevention surfaces as failed entry, not 4xx', async () => {
    // Seed: folder_root → folder_child → folder_grandchild
    // Try to move folder_root into folder_grandchild
    const res = await authedPost('/v2/folders/bulk', {
      action: 'move',
      ids: ['folder_root'],
      parent_id: 'folder_grandchild',
    })
    expect(res.status).toBe(200) // success status, error is per-id
    const body = await res.json()
    expect(body.processed).toEqual([])
    expect(body.failed[0]).toMatchObject({
      id: 'folder_root',
      code: 'conflict',
      message: expect.stringContaining('Cycle'),
    })
  })
})
```

- [ ] **Step 3: Run all bulk tests**

```
pnpm --filter backend test -- --run files-bulk folders-bulk
```

Expected: PASS dla wszystkich. Suma: ~6 (Task 10 happy path) + 6 (Task 12 happy path) + 7 (limits + partial files) + 5 (limits + partial folders) = ~24 testów.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/test/routes/v2/files-bulk.test.ts \
        apps/backend/test/routes/v2/folders-bulk.test.ts
git commit -m "$(cat <<'EOF'
test(backend): edge cases for /v2/files/bulk and /v2/folders/bulk

Covers:
- 100 ID limit (D1 bound parameter cap)
- Empty ids rejection
- Partial success with mixed not_found / conflict / processed
- Pre-batch validation errors (missing/trashed target folder)
  return 4xx with V2Error, not per-id failed[]
- Cycle prevention shows up in failed[] with code: 'conflict'

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Full verify — wszystkie buildy/testy zielone przed Etapem 1.B

> Ten task jest punktem kontrolnym przed handoffem do Etapu 1.B. Nie kontynuuj jeśli któryś krok poniżej fail.

- [ ] **Step 1: SDK build**

```
pnpm --filter @unisource/sdk build
```

Expected: PASS. Wszystkie zmiany z Task 1-13 kompilują się.

- [ ] **Step 2: SDK tests (full suite)**

```
pnpm --filter @unisource/sdk test
```

Expected: PASS dla wszystkich istniejących testów + nowych:
- error-codes.test.ts (Task 1)
- transport-auth.test.ts (Task 3)
- transport-error-parsing.test.ts (Task 4)
- bulk-schemas.test.ts (Task 5)
- files.test.ts (przepisany w Task 11)
- folders.test.ts (zaktualizowany w Task 13)
- Wszystkie inne istniejące testy V2 (transport, client, user-files, main-storage, shares, share-links, app, beta-warning, schemas) — bez regresji

- [ ] **Step 3: Backend tests (full suite)**

```
pnpm --filter backend test
```

Expected: PASS. W szczególności:
- error-codes.contract.test.ts (Task 8)
- files-bulk.test.ts (Task 10 + Task 14 edge cases)
- folders-bulk.test.ts (Task 12 + Task 14 edge cases)
- Wszystkie istniejące testy backendu — bez regresji

- [ ] **Step 4: Type-check obu paczek**

```
pnpm --filter @unisource/sdk typecheck
pnpm --filter backend typecheck
```

Expected: PASS bez błędów.

- [ ] **Step 5: Manual smoke check**

Sprawdź ręcznie te pliki/eksporty:

```
# SDK eksporty z @unisource/sdk/v2
node -e "import('@unisource/sdk/v2').then(m => console.log(Object.keys(m).sort()))"
```

Expected output zawiera (między innymi):
- `V2_ERROR_CODES`
- `isV2ErrorCode`
- `v2BulkResponseSchema`
- `v2BulkFailureSchema`
- `UnisourceV2Client`
- `UnisourceV2Error`

```
# Backend nie ma już files.legacy.ts
ls apps/backend/src/routes/v2/files.legacy.ts 2>&1
```

Expected: `No such file or directory`

```
# Brak importów ze starych endpointów
grep -rn "bulk-trash\|bulk-restore\|bulk-move" apps/backend/src apps/backend/test packages/unisource-sdk/src packages/unisource-sdk/tests
```

Expected: brak hitów, lub tylko hity w `legacy-draft.ts` / `client.v2.*` (legacy frozen namespace) — to OK.

- [ ] **Step 6: Empty checkpoint commit (optional)**

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(root): checkpoint — Etap 1.A foundation green, ready for Etap 1.B

All foundation tasks 1-14 complete:
- SDK V2_ERROR_CODES + V2ErrorCode | 'unknown' + rawCode
- SDK transport apiKey + auth: 'none' + error parser narrowing
- SDK bulk envelope schema (processed + failed[])
- SDK client.files.bulk* and client.folders.bulk* on /v2/<resource>/bulk
- Backend V2_ERROR_CODES (separate copy) + contract test
- Backend POST /v2/files/bulk + POST /v2/folders/bulk with discriminated union
- Backend cycle prevention for folder bulk move (returns code: 'conflict')
- Backend bulk DB helpers return per-id BulkResult
- Edge cases: 100-id limit, partial success, missing/trashed target, cycle

Etap 1.B (3 parallel subagents for folders CRUD/myFiles, admin, public)
can now start.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Push Etap 1.A do `beta`

- [ ] **Step 1: Verify branch**

```
git branch --show-current
```

Expected: `beta`. Jeśli nie — `git checkout beta` (zakładając że zmiany były robione na beta zgodnie ze specem).

- [ ] **Step 2: Verify ahead/behind status**

```
git status -sb
```

Expected: `## beta...origin/beta [ahead N]` gdzie N to liczba commitów z Etapu 1.A. Wszystkie zmiany committed.

- [ ] **Step 3: Push**

> **Confirmation point:** Push do `beta` jest zmianą na shared branch. **Zatrzymaj się tutaj i potwierdź z userem przed push.** Push nie jest destruktywny (`beta` jest dev branchem), ale zmiany trafią do remote.

```bash
git push origin beta
```

Expected: success. Jeśli push fail (rejection przy non-fast-forward) — zatrzymać się, porozmawiać z userem przed `--force-with-lease` (CLAUDE.md / safety guidelines).

- [ ] **Step 4: Verify remote state**

```
git log origin/beta --oneline | head -20
```

Expected: widać commity z Task 1-14 + checkpoint.

---

## Szczegółowe zadania — Etap 1.B (Zasoby SDK)

> **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`. Etap 1.B wymaga **świeżej sesji** orkiestratora z handoff dokumentem `plans/v2-section-1-sdk-parytet-handoff.md`. Etap 1.A musi być wcześniej zielony i pushed na `beta`.
>
> Orkiestrator dispatcha 3 subagentów RÓWNOLEGLE (jeden message z 3 tool calls). Każdy subagent dostaje swój briefing i pracuje w izolowanym worktree. Po zakończeniu wszystkich 3 — orkiestrator robi review (two-stage), merge, changeset.

### Wspólne zasady dla wszystkich subagentów Etapu 1.B

- **Branch base:** `beta` (po Etapie 1.A pushed). Każdy subagent w worktree ma branch `beta-section1b-<short-name>`.
- **TDD discipline:** dla każdej metody publicznej write failing test → run fail → implement → run pass → commit.
- **Test path:** `packages/unisource-sdk/tests/v2/<resource>.test.ts`.
- **Resource path:** `packages/unisource-sdk/src/v2/resources/<resource>.ts`.
- **Schema path:** `packages/unisource-sdk/src/v2/<resource>-schemas.ts` (lub uzupełnienie istniejącego pliku schematów dla folders).
- **Touch points addytywne (orkiestrator scali konflikty):**
  - `packages/unisource-sdk/src/v2/client.ts` — dodaj `readonly <resource>: ReturnType<typeof create<Resource>Resource>` + inicjalizację w constructorze
  - `packages/unisource-sdk/src/v2/index.ts` — eksporty publicznych typów
- **Test patterns wzorcem dla nowego subagenta:** `tests/v2/main-storage.test.ts` (Plan 2 lifecycle methods), `tests/v2/files.test.ts` (po Task 11) — z mock fetch i asercjami na method/path/body/headers.
- **Commit convention:** `feat(sdk): add UnisourceV2Client.<resource>.<method>(...)`.

---

### Task 17: Subagent #1 — folders CRUD + `client.myFiles`

#### Setup (orkiestrator)

- [ ] **S1: Create worktree from `beta`**

```bash
git fetch origin beta
git worktree add ../UniSource-wt-folders-myfiles -b beta-section1b-folders-myfiles origin/beta
```

- [ ] **S2: Verify worktree state**

```bash
cd ../UniSource-wt-folders-myfiles
pnpm install
pnpm --filter @unisource/sdk test
```

Expected: SDK tests zielone (Etap 1.A baseline).

#### Subagent dispatch — briefing

Briefing dla subagenta (orkiestrator wysyła to jako prompt agenta):

```
Pracujesz w worktree `../UniSource-wt-folders-myfiles` na branchu `beta-section1b-folders-myfiles`.

Twój scope:
1. Rozbuduj client.folders o 5 metod CRUD:
   - create({ name, parent_id?, color_tag? }) → POST /folders
   - get(id) → GET /folders/:id
   - update(id, { name?, color_tag? }) → PATCH /folders/:id
   - delete(id, { permanent? }) → DELETE /folders/:id (?permanent=true gdy permanent: true)
   - restore(id) → POST /folders/:id/restore

2. Utwórz client.myFiles z 3 metodami:
   - list({ folder_id?, limit?, cursor? }) → GET /my-files
   - listTrash({ limit?, cursor? }) → GET /my-files/trash
   - move(id, { folder_id }) → PATCH /my-files/:id/move

KRYTYCZNE punkty kontraktu:
- folders CRUD URL pattern: `/folders/...` (NIE /v2/folders/) — SDK pasuje do realnego backendu, który mountuje folders pod prefix /folders. Sprawdź apps/backend/src/index.ts jeśli wątpisz.
- list response shape: backend zwraca { items, next_cursor, limit } (NIE { items, page }). Sprawdź apps/backend/src/routes/folders.ts żeby potwierdzić aktualny shape responsów.
- create response: { folder: <Folder> }
- update response: { folder: <Folder> }
- delete response: { success, id, permanent } (lub z folders_deleted dla permanent)
- restore response: { success, id }
- myFiles list response: { items, next_cylinder, limit } (analogicznie do folders.list)
- myFiles move response: { success, id, folder_id }

Wzorce do naśladowania:
- packages/unisource-sdk/src/v2/resources/main-storage.ts — Plan 2 lifecycle (CRUD per id z list)
- packages/unisource-sdk/src/v2/resources/user-files.ts — Plan 2 /files/:id*
- packages/unisource-sdk/tests/v2/main-storage.test.ts — wzorzec testów

Schemas:
- Dodaj packages/unisource-sdk/src/v2/my-files-schemas.ts z Zod schemami dla list/move requests/responses
- Folders CRUD schemy mogą iść do istniejącego packages/unisource-sdk/src/v2/folders.ts (gdzie są folder list schemy)

Touch points (addytywne):
- packages/unisource-sdk/src/v2/client.ts: dodaj `readonly myFiles: ReturnType<typeof createMyFilesResource>` i inicjalizuj w constructorze. Folders już jest, nic do zmiany.
- packages/unisource-sdk/src/v2/index.ts: dodaj eksporty publicznych typów (V2MyFile, V2MyFilesListResponse, etc., plus folder CRUD types jeśli nowe).

TDD discipline:
- Dla każdej metody: failing test → run → fail → implement → run → pass → commit
- Test format jak w files.test.ts (po Task 11): mock fetch, asercja na method/path/body/headers, response parsing test, abort signal forwarding test, asUser forwarding test
- Każda metoda → osobny describe block

Convention commitu:
- feat(sdk): add UnisourceV2Client.folders.create
- feat(sdk): add UnisourceV2Client.folders.get
- ... (po jednym commit per metoda lub jeden zbiorczy commit per resource — twój wybór)

Po zakończeniu:
- Wszystkie 8 metod (5 folders CRUD + 3 myFiles) zaimplementowane i przetestowane
- pnpm --filter @unisource/sdk test → zielony
- pnpm --filter @unisource/sdk build → zielony
- Commits pushed do origin/beta-section1b-folders-myfiles

NIE rób:
- Backend changes
- Modyfikacja istniejących SDK metod (oprócz dodawania readonly fields w client.ts)
- Refactor schemas (zostaw existing structure)
- Migracja do innego namespace (myFiles zostaje osobno od userFiles)
```

#### Verification (orkiestrator po subagencie)

- [ ] **V1: Subagent zwrócił raport**

Subagent raportuje: liczba metod zaimplementowanych, liczba testów (powinno być ~40-50 — po 5-6 testów per metoda × 8 metod), liczba commitów, log output testów.

- [ ] **V2: Two-stage review**

```bash
cd ../UniSource-wt-folders-myfiles
git log --oneline beta..HEAD
git diff beta..HEAD --stat
```

Sprawdź:
- Tylko pliki wymienione w "Touch points" + nowe resource files + nowe schema files
- Brak modyfikacji istniejących metod folders (tylko dodanie nowych)
- Brak backend changes
- Sygnatury metod odpowiadają briefingowi

- [ ] **V3: Run tests in worktree**

```bash
pnpm --filter @unisource/sdk test
pnpm --filter @unisource/sdk build
```

Expected: PASS. Jeśli FAIL — odeślij subagent z poprawkami.

- [ ] **V4: Push subagent branch**

```bash
git push origin beta-section1b-folders-myfiles
```

> Merge do `beta` zostaje na Task 20 (orkiestrator merge razem z innymi 2 subagentami).

---

### Task 18: Subagent #2 — `client.admin` (11 metod)

#### Setup (orkiestrator)

- [ ] **S1: Create worktree**

```bash
git worktree add ../UniSource-wt-admin -b beta-section1b-admin origin/beta
cd ../UniSource-wt-admin
pnpm install
pnpm --filter @unisource/sdk test
```

Expected: zielony.

#### Subagent dispatch — briefing

```
Pracujesz w worktree `../UniSource-wt-admin` na branchu `beta-section1b-admin`.

Twój scope: utwórz client.admin z 11 metodami pokrywającymi backend apps/backend/src/routes/admin.ts (mountowany pod /admin).

Pełna lista metod:

1. getService() → GET /admin/service
   Response: { service: { id, name, max_storage_bytes, current_used_bytes, max_file_size_bytes, recommended_upload_destination, created_at } }

2. updateService({ max_storage_bytes, max_file_size_bytes }) → PATCH /admin/service
   Response: jak getService

3. updateServiceSettings({ recommended_upload_destination }) → PATCH /admin/service/settings
   Response: jak getService

4. getServiceUsage() → GET /admin/service/usage
   Response: { service_id, max_storage_bytes, current_used_bytes, used_percent }

5. listAuditLog({ user_id?, action?, resource_type?, cursor?, limit? }) → GET /admin/audit-log
   Response: { items, next_cursor, limit }
   Note: cursor pagination

6. listUsers({ search?, offset?, limit? }) → GET /admin/users
   Response: { items, total, offset, limit }
   UWAGA: offset pagination (NIE cursor) — backend zależy od Appwrite SDK. To celowy known limitation.

7. updateUser(userId, { name?, email?, status?, labels?, role?, max_storage_bytes? }) → PATCH /admin/users/:userId
   Response: { user: <AdminUser> }

8. resetUserPassword(userId, { password }) → POST /admin/users/:userId/password
   Response: { success, user_id }

9. updateUserRole(userId, { role }) → PATCH /admin/users/:userId/role
   role: 'user' | 'plus' | 'admin'
   Response: { user: <AdminUser> }

10. updateUserStorageLimit(userId, { limit_bytes }) → PATCH /admin/users/:userId/storage-limit
    limit_bytes: number | null
    Response: { user: <AdminUser> }

11. reconcileQuota({ dryRun? }) → POST /admin/quota/reconcile
    Query: ?dry_run=true|false
    Response: { service_drift_bytes, users_fixed, ... } (sprawdź apps/backend/src/db/services.ts → reconcileQuota return type)

Wzorce do naśladowania:
- packages/unisource-sdk/src/v2/resources/share-links.ts — wzorzec resource z mixed CRUD
- packages/unisource-sdk/src/v2/resources/user-files.ts — Plan 2 per-id methods
- packages/unisource-sdk/tests/v2/share-links.test.ts — wzorzec testów

Schemas:
- Utwórz packages/unisource-sdk/src/v2/admin-schemas.ts z Zod schemami:
  - adminServiceResponseSchema (uses across getService, updateService, updateServiceSettings)
  - adminServiceUsageResponseSchema
  - adminAuditLogListResponseSchema
  - adminUsersListResponseSchema
  - adminUserResponseSchema (used across updateUser, updateUserRole, updateUserStorageLimit)
  - adminPasswordResetResponseSchema
  - adminQuotaReconcileResponseSchema
  - request schemas dla każdej metody (zgodnie z Zod schemas w admin.ts handlerze)

Touch points (addytywne):
- packages/unisource-sdk/src/v2/client.ts: dodaj `readonly admin: ReturnType<typeof createAdminResource>` + inicjalizacja
- packages/unisource-sdk/src/v2/index.ts: eksporty typów

TDD discipline:
- 11 metod → ~6-8 testów per metoda (URL/method/body/headers/response/asUser/abort/error) → ~75 testów
- Format jak w share-links.test.ts

Specjalne uwagi:
- listUsers offset/limit (nie cursor): w request body / query params użyj `offset` i `limit` jako zwykłe numbers, nie cursor string
- reconcileQuota query param `dry_run` (snake_case w URL, ale `dryRun` w SDK args dla DX) — transformer w metodzie
- listAuditLog: cursor jako string, działa identycznie z folders.list cursor

NIE rób:
- Backend changes
- Mieszania client.admin z istniejącym client.* — admin to nowy namespace
- Refactor admin endpoints w backendzie
- Zmiana offset → cursor dla listUsers (zostaje known limitation)
```

#### Verification

- [ ] **V1-V4: Analogicznie do Task 17 V1-V4**

Po teście i build, push branch:
```bash
git push origin beta-section1b-admin
```

---

### Task 19: Subagent #3 — `client.public` (3 metody, `auth: 'none'`)

#### Setup (orkiestrator)

```bash
git worktree add ../UniSource-wt-public -b beta-section1b-public origin/beta
cd ../UniSource-wt-public
pnpm install
pnpm --filter @unisource/sdk test
```

#### Subagent dispatch — briefing

```
Pracujesz w worktree `../UniSource-wt-public` na branchu `beta-section1b-public`.

Twój scope: utwórz client.public z 3 metodami/funkcjami pokrywającymi backend apps/backend/src/routes/public.ts (mountowany pod /public).

Pełna lista:

1. getShareLink(slug) → GET /public/:slug
   Response (when password not required):
     { file_id, filename, size, mime_type, requires_password: false, download_url, url_expires_at, link_name, link_expires_at }
   Response (when password required):
     { filename, size, mime_type, requires_password: true, link_name }
   
   KRYTYCZNE: musi używać auth: 'none' w request options. Endpoint jest anonymous.

2. unlockShareLink(slug, { password }) → POST /public/:slug/unlock
   Response: { file_id, filename, size, mime_type, requires_password: false, download_url, url_expires_at, link_name, link_expires_at }
   
   KRYTYCZNE: auth: 'none'.

3. buildDownloadUrl(slug, token) → URL builder, BEZ HTTP call
   Returns: string — `${baseUrl}/public/${encodeURIComponent(slug)}/download?token=${encodeURIComponent(token)}`
   
   KRYTYCZNE: NIE wywołuje fetch. To pure URL constructor.

Wzorce do naśladowania:
- packages/unisource-sdk/src/v2/resources/app.ts — najprostszy resource (tylko 1 metoda)
- packages/unisource-sdk/tests/v2/transport-auth.test.ts — pattern dla testów auth: 'none'

Implementation pattern dla `buildDownloadUrl`:

```ts
export function createPublicResource(request: V2Request, baseUrl: string) {
  return {
    getShareLink: (slug: string, signal?: AbortSignal): Promise<...> =>
      request('GET', `/public/${encodeURIComponent(slug)}/`, {
        signal,
        auth: 'none',
        parser: ...,
      }),

    unlockShareLink: (slug: string, args: { password: string }, signal?: AbortSignal): Promise<...> =>
      request('POST', `/public/${encodeURIComponent(slug)}/unlock`, {
        body: args,
        signal,
        auth: 'none',
        parser: ...,
      }),

    buildDownloadUrl: (slug: string, token: string): string => {
      const url = new URL(`/public/${encodeURIComponent(slug)}/download`, baseUrl)
      url.searchParams.set('token', token)
      return url.toString()
    },
  }
}
```

UWAGA dla `createPublicResource`:
- Sygnatura przyjmuje `baseUrl` jako drugi argument (oprócz `request`). To dlatego, że buildDownloadUrl konstruuje URL bez wysłania requestu. Update client.ts żeby przekazywać `config.baseUrl`.
- Alternatywa: przyjmuj cały `config` jako drugi argument. Twój wybór, ale udokumentuj wybór w komentarzu.

Schemas:
- Utwórz packages/unisource-sdk/src/v2/public-schemas.ts:
  - publicShareLinkResponseSchema (discriminated union: requires_password: true | false)
  - publicUnlockResponseSchema (zawsze z download_url)
  - request schemas (unlockShareLinkRequestSchema)

Touch points (addytywne):
- client.ts: dodaj `readonly public: ReturnType<typeof createPublicResource>` + inicjalizacja
  - Inicjalizacja: `this.public = createPublicResource(request, config.baseUrl)`
- index.ts: eksporty typów

TDD discipline — KRYTYCZNE testy:
1. getShareLink BEZ Authorization header gdy klient ma getToken — explicite asercja `expect(headers['Authorization']).toBeUndefined()`
2. getShareLink BEZ Authorization gdy klient ma apiKey — analogicznie
3. unlockShareLink BEZ Authorization w obu konfiguracjach
4. buildDownloadUrl: weryfikuj że fetch NIE został wywołany (vi.mocked(fetch).mock.calls.length === 0)
5. buildDownloadUrl encodes slug i token poprawnie (testy z special characters: `slug = 'my slug/with?special=chars'`, `token = 'jwt.with.dots'`)
6. getShareLink discriminated union response parsing: requires_password: true vs false → parser akceptuje oba

Format testu dla auth: 'none':

```ts
it('does NOT send Authorization even when getToken is configured', async () => {
  vi.stubGlobal('fetch', mockOk(...))
  const client = new UnisourceV2Client({
    baseUrl: 'https://api.example.com',
    serviceId: 'svc',
    getToken: () => 'jwt_token',
    silentBeta: true,
  })
  await client.public.getShareLink('test-slug')
  const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
  expect(headers['Authorization']).toBeUndefined()
})
```

NIE rób:
- Backend changes
- Wysłania fetch w buildDownloadUrl (tylko URL constructor)
- Top-level functions (jak legacy getPublicFileInfo) — wszystkie idą do client.public.*
- Implementacja polling/decoding tokenu (token jest opaque string)
```

#### Verification

- [ ] **V1-V4: Analogicznie do Task 17 V1-V4**

Po teście i build:
```bash
git push origin beta-section1b-public
```

## Szczegółowe zadania — Workflow orkiestratora po Etapie 1.B

> Te taski (20-24) wykonuje orkiestrator z głównego worktree (NIE z subagent worktree). Subagenty z Tasks 17-19 zakończyły pracę na 3 osobnych branchach na `origin`. Teraz scala je do `beta`.

### Task 20: Merge subagent worktrees do `beta`

**Files:**
- Modify (resolwa konfliktów): `packages/unisource-sdk/src/v2/client.ts`, `packages/unisource-sdk/src/v2/index.ts`

- [ ] **Step 1: Update local `beta` branch**

```bash
cd /path/to/main/worktree  # główny clone, nie subagent worktree
git checkout beta
git pull origin beta
git fetch origin beta-section1b-folders-myfiles beta-section1b-admin beta-section1b-public
```

- [ ] **Step 2: Merge subagent #1 (folders + myFiles)**

```bash
git merge origin/beta-section1b-folders-myfiles --no-ff -m "$(cat <<'EOF'
Merge subagent #1: V2 client folders CRUD + myFiles

- folders.create / get / update / delete / restore
- myFiles.list / listTrash / move

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Spodziewane konflikty:
- `client.ts` — subagent dodał `readonly myFiles`, ten merge przejdzie clean (folders już ma readonly)
- `index.ts` — eksporty addytywne, clean

Jeśli konflikt — resolwa addytywnie (zachowaj wszystkie linie z obu stron).

- [ ] **Step 3: Merge subagent #2 (admin)**

```bash
git merge origin/beta-section1b-admin --no-ff -m "$(cat <<'EOF'
Merge subagent #2: V2 client admin (11 methods)

- getService, updateService, updateServiceSettings, getServiceUsage
- listAuditLog, listUsers (offset pagination — known limitation)
- updateUser, resetUserPassword, updateUserRole, updateUserStorageLimit
- reconcileQuota

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Spodziewane konflikty:
- `client.ts` — subagent #2 dodał `readonly admin` w innym miejscu niż subagent #1 dodał `readonly myFiles`. Konflikt łatwo resolwowalny — zachowaj oba pola, zachowaj obie inicjalizacje w constructorze.
- `index.ts` — analogicznie addytywne.

- [ ] **Step 4: Merge subagent #3 (public)**

```bash
git merge origin/beta-section1b-public --no-ff -m "$(cat <<'EOF'
Merge subagent #3: V2 client public (3 methods, auth: 'none')

- getShareLink, unlockShareLink (anonymous endpoints)
- buildDownloadUrl (URL builder, no fetch)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Spodziewane konflikty: jak w Step 3 — addytywne pola w `client.ts` i eksporty w `index.ts`.

- [ ] **Step 5: Cleanup worktrees**

```bash
git worktree remove ../UniSource-wt-folders-myfiles
git worktree remove ../UniSource-wt-admin
git worktree remove ../UniSource-wt-public
git branch -d beta-section1b-folders-myfiles beta-section1b-admin beta-section1b-public
git push origin --delete beta-section1b-folders-myfiles beta-section1b-admin beta-section1b-public
```

> **Confirmation point:** usunięcie remote branches jest destruktywne. Potwierdź z userem przed `git push --delete`.

---

### Task 21: Full build/test po merge

- [ ] **Step 1: SDK build**

```bash
pnpm --filter @unisource/sdk build
```

Expected: PASS. Jeśli FAIL po merge — najczęstsza przyczyna to literówka w `client.ts` (np. duplikat readonly field przy resolwie konfliktu) lub brakujący eksport w `index.ts`.

- [ ] **Step 2: SDK tests (full)**

```bash
pnpm --filter @unisource/sdk test
```

Expected: PASS. Każdy z 3 subagentów dodał ~40-75 testów; suma to ~150-200 nowych testów + bazowe ~150 = ~300+ testów.

- [ ] **Step 3: Backend tests (regression)**

```bash
pnpm --filter backend test
```

Expected: PASS bez regresji (Etap 1.B nie dotykał backendu).

- [ ] **Step 4: Manual smoke check eksportów**

```bash
node -e "import('@unisource/sdk/v2').then(m => console.log(Object.keys(m).filter(k => /admin|public|myFiles|folders/i.test(k)).sort()))"
```

Expected: widzisz eksporty od wszystkich 3 subagentów.

---

### Task 22: Changeset SDK (minor bump)

- [ ] **Step 1: Create changeset**

```bash
pnpm changeset
```

Wybierz `@unisource/sdk` → `minor` bump. Treść:

```
---
"@unisource/sdk": minor
---

## V2 Client — section 1 SDK parity + transport debt

**New resources on UnisourceV2Client:**
- `client.folders.create / get / update / delete / restore` (CRUD beyond list/breadcrumbs)
- `client.myFiles.list / listTrash / move` (separate from `client.userFiles` Plan 2)
- `client.admin.*` — 11 methods covering /admin endpoints
- `client.public.*` — getShareLink, unlockShareLink, buildDownloadUrl (anonymous)

**Auth and error handling:**
- `apiKey` config option for static server-to-server credential (mutually exclusive with `getToken`)
- `auth: 'none'` per-request override for anonymous endpoints
- `V2ErrorCode` typed union exported from `@unisource/sdk/v2`
- `isV2ErrorCode` runtime guard
- `UnisourceV2Error.code: V2ErrorCode | 'unknown'` with `rawCode` for unknown backend codes

**Bulk operations — BREAKING in V2 beta:**
- New canonical `client.<files|folders>.bulk(args)` with discriminated union body
- Convenience wrappers (bulkTrash, bulkRestore, bulkMove) delegate to bulk(...)
- Response shape changed from `{ success, processed_count, failed_ids? }` to
  `{ processed: string[], failed: [{ id, code, message }] }`
- Old `/v2/<resource>/bulk-{trash,restore,move}` endpoints removed; everything
  goes to `/v2/<resource>/bulk` with `action` in body
- bulkMove requires explicit folder_id / parent_id (null = root, but must be present)

V2 beta has no production consumers — these breaking changes do not affect
UnisourceClient (legacy) which remains stable.

**Known limitations (documented in V2_MIGRATION.md):**
- `apiKey` does NOT work for `/v2/files` and `/v2/folders` (backend `/v2/*` is
  user-only auth). Works for `/admin`, `/main`, `/app`, `/public`.
- `client.admin.listUsers` uses offset pagination (Appwrite SDK constraint).
```

- [ ] **Step 2: Verify changeset file created**

```bash
ls .changeset/*.md
```

Expected: nowy plik `.changeset/<random-name>.md` z treścią powyżej.

- [ ] **Step 3: Commit changeset**

```bash
git add .changeset/
git commit -m "$(cat <<'EOF'
chore(sdk): add changeset for V2 section 1 (minor bump)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

> **Uwaga semver:** changeset NIE odpalają jeszcze publish. To zrobi późniejszy release flow (`pnpm changeset version` → bump version w package.json → `pnpm changeset publish` → npm publish). Zgodnie z `V2_MIGRATION.md` §3 — SDK V2 jest beta, nie ma realnych konsumentów; release może być automatycznym beta-tagiem przez CI.

---

### Task 23: Update `V2_MIGRATION.md`

**Files:**
- Modify: `V2_MIGRATION.md`

- [ ] **Step 1: Update TL;DR table**

W `V2_MIGRATION.md` zlokalizuj TL;DR (~linia 9). Zaktualizuj wiersz `UnisourceV2Client (nowy)`:

```
| **SDK — `UnisourceV2Client` (nowy)** | ~71% pokrycia (49 metod / 11 zasobów) | Sekcje 2 (upload), 3 (releases) — pozostałe legacy backend route'y |
```

(Liczba 49 = 27 baseline + 5 folders CRUD + 3 myFiles + 11 admin + 3 public. 11 zasobów = 7 baseline + admin + myFiles + public + (folders rozbudowane). Skoryguj precyzyjnie po sprawdzeniu.)

- [ ] **Step 2: Update §2 SDK section — `UnisourceV2Client` resource table**

Dodaj wiersze do tabeli `UnisourceV2Client` (sekcja "Pokrycie: częściowe"):

```
| `folders` | `list`, `breadcrumbs`, `bulk*`, `create`, `get`, `update`, `delete`, `restore` | `/v2/folders` + `/folders` | ✅ pełne pokrycie V2 + CRUD |
| `myFiles` | `list`, `listTrash`, `move` | `/my-files*` | ✅ pełne (listy + move) |
| `admin` | 11 metod (service/usage/audit/users/role/storage/quota) | `/admin/*` | ✅ pełne (offset pagination dla listUsers — known limitation) |
| `public` | `getShareLink`, `unlockShareLink`, `buildDownloadUrl` | `/public/*` | ✅ pełne (anonymous, auth: 'none') |
```

Zachowaj istniejące wiersze (`app`, `files`, `userFiles`, `mainStorage`, `shareLinks`, `shares`).

- [ ] **Step 3: Update §"Czego brakuje w `UnisourceV2Client`"**

Usuń z tej sekcji rzeczy które zostały zrobione w sekcji 1:
- ~~Folder CRUD: `POST /folders`...~~ (DONE)
- ~~`myFiles` listy: `GET /my-files`...~~ (DONE)
- ~~`admin.*` — 10 endpointów~~ (DONE — 11 metod, nie 10)
- ~~`public.*` — 3 endpointy~~ (DONE)

Zostają (na sekcje 2-4):
- `upload.*` — cały flow uploadu (10 endpointów). Sekcja 2.
- `releases.*` — 14 endpointów, backend wciąż legacy. Sekcja 3.

- [ ] **Step 4: Update §4 Niespójności — usuń zamknięte punkty**

Usuń z sekcji "Niespójności / dług techniczny":
- ~~1. Brak wsparcia API-key path~~ (DONE — `apiKey` w configu)
- ~~2. Bulk response envelope mismatch~~ (DONE — nowy `{processed, failed[]}`)
- ~~3. Brak typowanego enum `V2ErrorCode`~~ (DONE — `V2_ERROR_CODES` z `as const`)
- ~~Plik `v2/files.legacy.ts` do scalenia~~ (DONE — usunięty)

Zostają (orientacyjnie):
- Pliki z własnym `validationErrorHook` (`releases.ts`, `upload.ts`) → sekcje 2/3.

- [ ] **Step 5: Add new §"Known Limitations" section**

Dodaj sekcję pod §4 Niespójności:

```markdown
## 4.1 Known Limitations (po sekcji 1)

- **`apiKey` nie działa dla `/v2/files` i `/v2/folders`**. Backend `getAuthRouteMode()` w `apps/backend/src/middleware/auth.ts` listuje jako dual-auth tylko `/upload`, `/admin`, `/main`, `/releases`, `/app`. Server-to-server użytkownik z API key dostanie 401 na `client.files.list()` i `client.folders.list()`. Działa dla `client.admin.*`, `client.mainStorage.*`, `client.app.*`, `client.public.*` (no-auth path). Do rozwiązania w późniejszej iteracji backendu (poza sekcją 1).
- **`client.admin.listUsers` używa offset pagination**, nie cursor. Backend zależy od Appwrite SDK, który ma offset/limit. Niespójne z resztą V2 (audit-log używa cursor). Do rozwiązania jak/jeśli kiedyś zmieni się backend Appwrite.
- **Liczba endpointów admin: 10 vs 11.** `V2_MIGRATION_PLAN.md` §1 mówił "admin (10 endpointów)", realny backend ma 11 handlerów (`patch /service/settings` doszedł później).
- **Bulk delete dla files** (`POST /v2/files/bulk` z `action: 'delete'`) wykonuje tylko D1 cleanup. Fizyczny R2/Appwrite cleanup jest deferred do R2 lifecycle / Cloudflare Queues (zgodnie z `api-v2-architecture.md` §7). Single `DELETE /my-files/:id?permanent=true` w `fileRecords.ts` nadal robi storage cleanup.
- **Folder bulk move cycle prevention** wykonuje `getDescendantFolderIds` per-id w pętli — dla 100 IDs to 100 recursive CTE. Optymalizacja (jeden globalny CTE) możliwa w przyszłości.
- **BREAKING in V2 beta:** bulk response shape zmieniony z `{ success, processed_count, failed_ids? }` na `{ processed, failed[] }`. V2 beta nie ma produkcyjnych konsumentów — zmiana udokumentowana w changeset.
```

- [ ] **Step 6: Update §"Definicja skończonej refaktoryzacji V2"**

Zaznacz checkboxy:

```markdown
- [ ] Wszystkie route'y backendu używają V2Error / V2 helpers — **brak własnych `validationErrorHook`**.  ← sekcje 2-4
- [ ] `UnisourceV2Client` pokrywa wszystkie publiczne endpointy (poza `superadmin/*` i czysto wewnętrznymi).  ← sekcje 2-3
- [~] Spójny error envelope + spójny success envelope (rozwiązany problem bulk).  ← bulk done; success list envelope (`{items, page}` vs `{items, next_cursor, limit}`) zostaje na potem
- [x] API-key auth path obsługiwany w transport SDK.  ← Task 3
- [x] Wszystkie kody błędów typowane przez enum `V2ErrorCode` w SDK.  ← Task 1
- [x] `v2/files.legacy.ts` scalony z `v2/files.ts`.  ← Task 10
```

- [ ] **Step 7: Update data**

Zmień datę z `Stan na **2026-05-26**` na aktualną datę zakończenia sekcji 1.

- [ ] **Step 8: Commit**

```bash
git add V2_MIGRATION.md
git commit -m "$(cat <<'EOF'
docs(root): update V2_MIGRATION.md after section 1 completion

- SDK coverage: ~38% → ~71% (49 methods across 11 resources)
- Tick 3/6 boxes in "Definicja skończonej refaktoryzacji V2":
  - API-key auth path in SDK
  - V2ErrorCode typed enum
  - v2/files.legacy.ts merged
- Add §4.1 Known Limitations section (apiKey on /v2/*, admin offset
  pagination, bulk delete R2 cleanup, folder bulk move N+1 query)
- Remove closed items from §4 Niespójności

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Code review + finishing branch

- [ ] **Step 1: Push merged `beta`**

```bash
git push origin beta
```

> **Confirmation point:** push do `beta` (shared branch). Potwierdź z userem.

- [ ] **Step 2: Invoke `superpowers:requesting-code-review`**

Wywołaj skill `superpowers:requesting-code-review`. Skill poprosi o:
- diff zakresu (od point of departure z `main` lub od ostatniego review point)
- dispatch reviewer agenta
- summary findings

Adresuj findings przed Step 3.

- [ ] **Step 3: Invoke `superpowers:finishing-a-development-branch`**

Wywołaj skill `superpowers:finishing-a-development-branch`. Skill przedstawi userowi opcje:
- merge `beta` → `main` (NIE rekomendowane — V2 jeszcze niekompletne, sekcje 2-4 do zrobienia)
- create PR `beta` → `main` (możliwe, ale draft / not ready for merge)
- leave `beta` open (rekomendowane — zgodnie z `V2_MIGRATION.md` §3)

Rekomendacja zgodnie ze specem: **leave `beta` open**. V2 nie wraca do `main` przed kompletnością (po sekcjach 2-4).

- [ ] **Step 4: Update task tracker w V2_MIGRATION_PLAN.md (opcjonalnie)**

Jeśli `V2_MIGRATION_PLAN.md` ma sekcję ze statusem sekcji — zaznacz Sekcja 1 jako DONE. Jeśli nie ma — pomiń.

---

> **KONIEC SEKCJI 1.** Sekcje 2 (`upload.ts`), 3 (`releases.ts`), 4 (`superadmin.ts`) — osobne sesje, osobne plany, osobne handoff dokumenty.
