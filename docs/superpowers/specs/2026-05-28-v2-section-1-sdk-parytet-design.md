---
name: v2-section-1-sdk-parytet-design
description: Sekcja 1 V2 Migration — SDK V2 do parytetu z gotowym backendem + dług transportu. Fundament (apiKey, V2ErrorCode, bulk envelope, jeden /bulk endpoint per zasób) + 3 zasoby SDK równolegle (folders CRUD/myFiles, admin, public).
status: approved
date: 2026-05-28
related:
  - V2_MIGRATION.md
  - V2_MIGRATION_PLAN.md
  - api-v2-architecture.md
---

# Sekcja 1 V2 Migration — SDK V2 do parytetu + dług transportu

## Cel

Zamknąć cztery checkboxy z `V2_MIGRATION.md` §"Definicja skończonej refaktoryzacji V2":

- [x] **API-key auth path** obsługiwany w transport SDK
- [x] Wszystkie kody błędów typowane przez **enum `V2ErrorCode`** w SDK
- [x] **`v2/files.legacy.ts` scalony** z `v2/files.ts`
- [~] **Spójny error envelope + spójny success envelope** (bulk rozwiązany; success list envelope zostaje na potem)

Plus rozbudowanie `UnisourceV2Client` o brakujące zasoby tam, gdzie backend jest już V2: folders CRUD, myFiles listy/move, admin (11 endpointów), public (3 endpointy).

Frontend i `UnisourceClient` (legacy) **poza zakresem** — branch `beta` nie jest produkcyjny.

## Decyzje architektoniczne

Wszystkie decyzje uzgodnione z userem przed pisaniem specu.

### D1. Bulk envelope: S3-style

Wszystkie bulk endpointy V2 (zarówno files, jak i folders) zwracają:

```ts
type V2BulkResponse = {
  processed: string[]
  failed: Array<{
    id: string
    code: V2ErrorCode
    message: string
  }>
}
```

Frontend dostaje konkretny powód błędu per ID, nie tylko listę nieudanych. Stary flat shape `{ success, processed_count, failed_ids? }` zostaje **tylko** w `legacy-draft.ts` dla zamrożonego `UnisourceClient.v2.*` namespace.

### D2. Auth: `apiKey` + `getToken` + per-request `auth: 'none'`

`UnisourceV2ClientConfig`:

```ts
export interface UnisourceV2ClientConfig {
  baseUrl: string
  serviceId: string
  getToken?: () => string | null | undefined | Promise<string | null | undefined>
  apiKey?: string
  silentBeta?: boolean
}
```

Semantyka:

- `getToken` = JWT/user auth, token pobierany per request (frontend, auto-refresh).
- `apiKey` = server/service auth, statyczny sekret z env (backend bez refreshu).
- Oba podane → constructor rzuca: `Error('UnisourceV2Client: provide either apiKey or getToken, not both')`.
- `apiKey` → `Authorization: Bearer ${apiKey}`.
- `getToken` → `Authorization: Bearer ${await getToken()}`.
- Brak obu → bez headera `Authorization`.

Plus per-request override:

```ts
type V2AuthMode = 'default' | 'none'

interface V2RequestOptions<T> {
  body?: unknown
  query?: V2Query
  signal?: AbortSignal
  asUser?: string
  auth?: V2AuthMode    // 'none' = nie wysyłaj Authorization, nawet gdy klient ma credentials
  parser: V2ResponseParser<T>
}
```

`client.public.*` zawsze używa `auth: 'none'`. Użytkownik może mieć **jeden** klient SDK do auth + public.

### D3. `V2ErrorCode` jako `as const` array — DWIE kopie + contract test

Backend NIE importuje z SDK. Source of truth dla wire contract jest backend; SDK mirroruje. Dwie kopie listy `V2_ERROR_CODES`, contract test pilnuje synchronizacji.

Lista (zamknięty zestaw, zgodny z aktualnym backendem):

```
'validation_error', 'cursor_invalid', 'search_too_long',
'unauthorized', 'forbidden', 'not_found', 'rate_limited',
'internal_error', 'conflict', 'bad_gateway', 'gone'
```

**SDK** (`packages/unisource-sdk/src/v2/error-codes.ts`):

```ts
export const V2_ERROR_CODES = [...] as const
export type V2ErrorCode = typeof V2_ERROR_CODES[number]
export function isV2ErrorCode(x: string): x is V2ErrorCode {
  return (V2_ERROR_CODES as readonly string[]).includes(x)
}
```

`UnisourceV2Error` zmienia się:

```ts
export class UnisourceV2Error extends Error {
  code: V2ErrorCode | 'unknown'
  rawCode?: string  // oryginalny string z backendu, jeśli nie był znanym V2ErrorCode
  // ... reszta (status, requestId, details)
}
```

Parser w `transport.ts`:
- backend zwraca znany kod → `code: <V2ErrorCode>`, `rawCode` undefined
- backend zwraca nieznany kod → `code: 'unknown'`, `rawCode: <oryginalny string>`

**Backend** (`apps/backend/src/lib/v2/error-codes.ts`):

```ts
export const V2_ERROR_CODES = [...] as const  // ta sama lista co SDK
export type V2ErrorCode = typeof V2_ERROR_CODES[number]
```

Backend `apps/backend/src/lib/v2/errors.ts` importuje `V2ErrorCode` z lokalnego `error-codes.ts` (NIE z SDK).

**Contract test** (`apps/backend/test/v2-error-codes.contract.test.ts`):

```ts
import { V2_ERROR_CODES as backendCodes } from '../src/lib/v2/error-codes'
import { V2_ERROR_CODES as sdkCodes } from '@unisource/sdk/v2'

it('backend and SDK V2_ERROR_CODES are identical', () => {
  expect(new Set(backendCodes)).toEqual(new Set(sdkCodes))
  expect(backendCodes.length).toBe(sdkCodes.length)
})
```

### D4. Bulk endpoint: jeden per zasób z `action`

Konsolidacja trzech osobnych endpointów (`/bulk-trash`, `/bulk-restore`, `/bulk-move`) w **jeden** per zasób, z dyskryminowanym union body po `action`. Spójne ze spec V2 §3.1.

**Files** — `POST /v2/files/bulk`:

```ts
type V2FilesBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; folder_id: string | null }
  | { action: 'delete'; ids: string[] }
```

**Folders** — `POST /v2/folders/bulk`:

```ts
type V2FoldersBulkRequest =
  | { action: 'trash'; ids: string[] }
  | { action: 'restore'; ids: string[] }
  | { action: 'move'; ids: string[]; parent_id: string | null }
  | { action: 'delete'; ids: string[] }
```

Wymagania:

- Discriminated union po `action` (zod `discriminatedUnion`).
- `move` wymaga **jawnego** `folder_id`/`parent_id` (`null` = root, ale musi być w body — żadnych defaultów).
- Folder bulk move ma cycle prevention (recursive CTE w D1). Konflikt cyklu zwraca wpis w `failed[]` z `code: 'conflict'`. **NIE rozszerzamy** `V2_ERROR_CODES` o `cycle_detected`.
- Response zawsze `{ processed, failed[] }` (D1).
- `delete` w bulk = permanent (nie trash).
- Bulk obsługuje partial success — nie all-or-nothing.
- Max 100 ID (limit D1 bound parameters); 101+ → `validation_error`.

**SDK kanonicznie** używa `client.<resource>.bulk(args)`. Convenience wrappers (`bulkTrash`, `bulkRestore`, `bulkMove`) opcjonalnie delegują do `bulk(...)`. **Żadna publiczna metoda SDK nie używa** starych path-ów `/bulk-trash`/`/bulk-restore`/`/bulk-move`.

## Etap 1.A — Fundament (jedna sesja inline, sekwencyjnie)

Skill: `superpowers:executing-plans` + `test-driven-development`.

Subagentów nie używamy — zmiany są mocno powiązane (transport widzi errors widzi error-codes; backend bulk widzi DB layer).

### Kolejność zadań

1. **SDK error codes** — utworzyć `packages/unisource-sdk/src/v2/error-codes.ts` z `V2_ERROR_CODES` array + `V2ErrorCode` type + `isV2ErrorCode` helper.
2. **SDK errors refactor** — zmodyfikować `packages/unisource-sdk/src/v2/errors.ts`: `code: V2ErrorCode | 'unknown'`, `rawCode?: string`.
3. **SDK transport** — w `packages/unisource-sdk/src/v2/transport.ts`:
   - dodać `auth?: V2AuthMode` w `V2RequestOptions`
   - logika auth: `auth === 'none'` → bez `Authorization`; `apiKey` → `Bearer ${apiKey}`; `getToken` → `Bearer ${await getToken()}`; brak obu → bez `Authorization`
   - parser błędu: nieznany kod → `code: 'unknown'`, `rawCode: <string>`; znany → `code: <V2ErrorCode>`
4. **SDK client config + constructor validation** — w `packages/unisource-sdk/src/v2/client.ts`:
   - dodać `apiKey?: string` w `UnisourceV2ClientConfig`
   - constructor: `if (config.apiKey && config.getToken) throw new Error(...)`
5. **SDK bulk schema** — dodać `v2BulkFailureSchema` + `v2BulkResponseSchema` (do `schemas.ts` lub dedykowany plik). Stary `bulkOperationResponseSchema` zostaje w `legacy-draft.ts` dla `UnisourceClient.v2.*` legacy.
6. **Backend error codes** — utworzyć `apps/backend/src/lib/v2/error-codes.ts` z **tą samą** listą `V2_ERROR_CODES` (osobna kopia, NIE import z SDK).
7. **Backend errors refactor** — `apps/backend/src/lib/v2/errors.ts` importuje `V2ErrorCode` z lokalnego `error-codes.ts`.
8. **Contract test** — `apps/backend/test/v2-error-codes.contract.test.ts` porównuje `Set` z backend i SDK list, fail jeśli różne.
9. **Checkpoint testów** — uruchom:
   - `pnpm --filter @unisource/sdk build`
   - `pnpm --filter @unisource/sdk test` (auth/error parsing/bulk schema)
   - `pnpm --filter backend test` (contract test V2_ERROR_CODES)

   Jeśli któryś nie jest zielony — zatrzymać się, naprawić, dopiero potem ruszyć dalej. **NIE rozpoczynać** zadania 10 z czerwonym testem.
10. **Backend `/v2/files/bulk`** — rewrite `apps/backend/src/routes/v2/files.ts`:
    - usunięcie `apps/backend/src/routes/v2/files.legacy.ts` (cała logika wciela się do `files.ts`)
    - jeden `POST /v2/files/bulk` z discriminated union body po `action`
    - response `{ processed, failed[] }`
11. **Backend `/v2/folders/bulk`** — dodać do `apps/backend/src/routes/v2/folders.ts`:
    - `POST /v2/folders/bulk` z discriminated union body po `action`
    - cycle prevention w `move` (recursive CTE) → wpis w `failed[]` z `code: 'conflict'`
    - response `{ processed, failed[] }`
12. **DB bulk result refactor** — `apps/backend/src/db/fileRecords.ts` (`bulkTrashFileRecords`, `bulkRestoreFileRecords`, `bulkMoveFileRecords`, plus permanent delete) zwracają per-id wynik (sukces/error code + message), nie tylko listę sukcesów. Analogicznie dla folders DB (`apps/backend/src/db/folders.ts`).
13. **Backend tests** (`@cloudflare/vitest-pool-workers`):
    - `POST /v2/files/bulk`: trash, restore, move (jawny `folder_id`), delete (permanent)
    - `POST /v2/folders/bulk`: trash, restore, move (jawny `parent_id`), delete (permanent), cycle prevention → `code: 'conflict'`
    - Partial success: 5 IDs, część istnieje + część nie → `processed[]` ma istniejące, `failed[]` ma resztę z `code: 'not_found'`
    - Bulk limit: 101 IDs → `validation_error`
14. **Full verify**:
    - `pnpm --filter @unisource/sdk build`
    - `pnpm --filter @unisource/sdk test`
    - `pnpm --filter backend test`

    Wszystkie zielone.
15. **Commit i push do `beta`** — stosowne commity z konwencją CLAUDE.md (`feat(sdk):`, `feat(backend):`, `refactor(backend):`, `test(backend):`).

### Definicja końca Etapu 1.A

- SDK build zielony
- SDK test zielony
- Backend test zielony
- Contract test `V2_ERROR_CODES` zielony
- `apps/backend/src/routes/v2/files.legacy.ts` **usunięty**
- `POST /v2/files/bulk` działa dla `trash`/`restore`/`move`/`delete`
- `POST /v2/folders/bulk` działa dla `trash`/`restore`/`move`/`delete`
- Cycle prevention w folder move zwraca `code: 'conflict'`
- `client.files.bulk(...)` i `client.folders.bulk(...)` używają nowego endpointu `/bulk` oraz envelope `{ processed, failed }`
- Brak regresji w istniejących SDK testach (`client.userFiles`, `client.shares`, `client.shareLinks`, `client.app`, `client.mainStorage`)

## Etap 1.B — Zasoby SDK (3 subagenty równolegle, dopiero po zielonym 1.A)

Skill orkiestratora: `superpowers:dispatching-parallel-agents` + `subagent-driven-development`. Każdy subagent w osobnym worktree (`superpowers:using-git-worktrees`), na branchu z bazy `beta` (po zakończeniu 1.A).

### Subagent #1 — folders CRUD + `client.myFiles` (worktree `wt-folders-myfiles`)

**Folders CRUD** — rozbudowanie istniejącego `client.folders` w `packages/unisource-sdk/src/v2/resources/folders.ts`. Pięć nowych metod:

```ts
client.folders.create({ name, parent_id?, color_tag? })   // POST /folders
client.folders.get(id)                                     // GET /folders/:id
client.folders.update(id, { name?, color_tag? })           // PATCH /folders/:id
client.folders.delete(id, { permanent? })                  // DELETE /folders/:id (?permanent=true)
client.folders.restore(id)                                 // POST /folders/:id/restore
```

Istniejące metody zachowane: `list`, `breadcrumbs`, `bulk` (po zmianach z 1.A).

**Świadomy mix dwóch URL spaces:** `client.folders` mapuje:
- `/v2/folders/*` (listing, breadcrumbs, bulk)
- `/folders/*` (CRUD)

To pasuje do realnego backendu — nie zmieniamy URL na siłę.

**`client.myFiles`** — nowy resource, plik `packages/unisource-sdk/src/v2/resources/my-files.ts`:

```ts
client.myFiles.list({ folder_id?, limit?, cursor? })       // GET /my-files
client.myFiles.listTrash({ limit?, cursor? })              // GET /my-files/trash
client.myFiles.move(id, { folder_id })                     // PATCH /my-files/:id/move
```

`client.myFiles` zostaje **osobno** od `client.userFiles` (Plan 2 `/files/:id*`). Powód: dwa różne backend URL spaces (`/my-files` vs `/files/:id`), nie mieszamy ich w jednym SDK namespace.

**Schemy**: dedykowany plik `packages/unisource-sdk/src/v2/my-files-schemas.ts` (lub adekwatny plik dla nowych folders CRUD schemas, np. uzupełnienie istniejącego `folders.ts` w `packages/unisource-sdk/src/v2/`).

**Touch points (addytywne):**
- `packages/unisource-sdk/src/v2/client.ts` — dodaj `readonly myFiles: ReturnType<typeof createMyFilesResource>` + inicjalizacja w constructorze
- `packages/unisource-sdk/src/v2/index.ts` — dodaj eksporty typów publicznych

**Testy:**
- folders 5 nowych metod CRUD/restore: poprawny method/path/body/query
- folders istniejące `list`, `breadcrumbs`, `bulk` (po zmianach z 1.A) — sanity check, że nadal działają
- myFiles 3 metody: poprawny method/path/body/query

### Subagent #2 — `client.admin` (worktree `wt-admin`)

Nowy resource, plik `packages/unisource-sdk/src/v2/resources/admin.ts`. **11 metod** (uwaga: `V2_MIGRATION_PLAN.md` mówi "10 endpointów" — realny backend ma 11; to drobny rozjazd do udokumentowania w `V2_MIGRATION.md`):

```ts
client.admin.getService()                                         // GET /admin/service
client.admin.updateService({ max_storage_bytes, max_file_size_bytes })  // PATCH /admin/service
client.admin.updateServiceSettings({ recommended_upload_destination })  // PATCH /admin/service/settings
client.admin.getServiceUsage()                                    // GET /admin/service/usage
client.admin.listAuditLog({ user_id?, action?, resource_type?, cursor?, limit? })  // GET /admin/audit-log
client.admin.listUsers({ search?, offset?, limit? })              // GET /admin/users (offset, NIE cursor)
client.admin.updateUser(userId, { name?, email?, status?, labels?, role?, max_storage_bytes? })  // PATCH /admin/users/:userId
client.admin.resetUserPassword(userId, { password })              // POST /admin/users/:userId/password
client.admin.updateUserRole(userId, { role })                     // PATCH /admin/users/:userId/role
client.admin.updateUserStorageLimit(userId, { limit_bytes })      // PATCH /admin/users/:userId/storage-limit
client.admin.reconcileQuota({ dryRun? })                          // POST /admin/quota/reconcile?dry_run=...
```

**Specjalna uwaga:** `listUsers` używa offset pagination, nie cursor (backend zależy od Appwrite SDK, który ma offset). Schema reflektuje to wprost. Nie refaktorujemy backendu w tej sekcji.

**Schemy**: `packages/unisource-sdk/src/v2/admin-schemas.ts`.

**Touch points (addytywne):**
- `packages/unisource-sdk/src/v2/client.ts` — dodaj `readonly admin`
- `packages/unisource-sdk/src/v2/index.ts` — eksport

**Testy:** 11 metod z asercjami na method/path/body/query/headers per metoda. `listUsers` używa `offset`+`limit`, `listAuditLog` używa `cursor`+`limit`.

### Subagent #3 — `client.public` (worktree `wt-public`)

Nowy resource, plik `packages/unisource-sdk/src/v2/resources/public.ts`. **3 metody/funkcje**:

```ts
client.public.getShareLink(slug)                  // GET /public/:slug
client.public.unlockShareLink(slug, { password }) // POST /public/:slug/unlock
client.public.buildDownloadUrl(slug, token)       // URL builder, BEZ HTTP call
```

Wymagania krytyczne:

- `getShareLink` i `unlockShareLink` zawsze używają `auth: 'none'` w request options. Test musi explicite asserować, że nawet gdy klient jest skonfigurowany z `getToken` lub `apiKey`, header `Authorization` nie jest wysyłany.
- `buildDownloadUrl` to nie HTTP call — to URL builder zwracający ciąg postaci `${baseUrl}/public/${encodeURIComponent(slug)}/download?token=${encodeURIComponent(token)}`. Endpoint `GET /public/:slug/download` zwraca 302, więc na poziomie SDK użytkownik dostaje URL i otwiera w `<a href>` lub `window.location.href`. Test musi asserować, że `fetch` mock NIE został wywołany.

**Schemy**: `packages/unisource-sdk/src/v2/public-schemas.ts`.

**Touch points (addytywne):**
- `packages/unisource-sdk/src/v2/client.ts` — dodaj `readonly public`
- `packages/unisource-sdk/src/v2/index.ts` — eksport

**Testy:**
- `getShareLink` poprawny method/path/headers — **brak `Authorization`** mimo `getToken` w configu
- `getShareLink` poprawny method/path/headers — **brak `Authorization`** mimo `apiKey` w configu
- `unlockShareLink` analogicznie z body
- `buildDownloadUrl` — slug i token poprawnie encoded, brak fetch (mock nie został wywołany)

### Workflow orkiestratora po zakończeniu 3 subagentów

1. **Merge** wszystkich 3 worktree branches do `beta` (lub do tymczasowego scal-branch przed mergem do `beta`).
2. **Resolwa konfliktów** — głównie addytywne zmiany w:
   - `packages/unisource-sdk/src/v2/client.ts` — 3 nowe `readonly` fields, 3 inicjalizacje
   - `packages/unisource-sdk/src/v2/index.ts` — 3 grupy eksportów
3. **Pełny build + test:**
   - `pnpm --filter @unisource/sdk build`
   - `pnpm --filter @unisource/sdk test`
   - `pnpm --filter backend test`
4. **Changeset** (`pnpm changeset`) — minor bump SDK z treścią:

   ```
   feat(sdk): V2 client gets folders CRUD, myFiles, admin, public resources
   feat(sdk): V2 client supports apiKey auth + per-request auth: 'none'
   feat(sdk): V2 ErrorCode is now a typed union with isV2ErrorCode helper
   BREAKING in V2 beta: bulk response shape changed from
   { success, processed_count, failed_ids? } to { processed, failed[] }.
   V2 beta has no production consumers.
   ```
5. **Update `V2_MIGRATION.md`:**
   - liczba metod SDK V2: ~38% → docelowa wartość (orientacyjnie: 27 + 5 folders CRUD + 3 myFiles + 11 admin + 3 public ≈ 49 metod)
   - checkboxy z §"Definicja skończonej refaktoryzacji V2":
     - `[x]` API-key auth path obsługiwany w transport SDK
     - `[x]` Wszystkie kody błędów typowane przez enum `V2ErrorCode` w SDK
     - `[x]` `v2/files.legacy.ts` scalony z `v2/files.ts`
     - `[~]` Spójny error envelope + spójny success envelope (bulk rozwiązany; success list envelope `{items, page}` vs `{items, next_cursor, limit}` zostaje na potem)
   - sekcja "Niespójności / dług techniczny" — usunięte zamknięte punkty (1, 2, 3 z §4)
   - sekcja Known Limitations (patrz "Granica zakresu / known limitations" w tym specu) — dopisane.
6. **Code review** — `superpowers:requesting-code-review` przed mergem do `beta` (jeśli pracowano na scal-branch).
7. **Decyzja końca branchu** — `superpowers:finishing-a-development-branch` — opcje przedstawione userowi. Rekomendacja zgodnie z `V2_MIGRATION.md` §3: zostawiamy w `beta`, V2 nie wraca do `main` przed kompletnością.

## Granica zakresu / known limitations

### Poza zakresem Sekcji 1

- Frontend bez zmian.
- Legacy `UnisourceClient` i jego `client.v2.*` zostają frozen/deprecated.
- Backend `upload.ts`, `releases.ts`, `superadmin.ts` poza zakresem (sekcje 2, 3, 4).
- Backend auth middleware bez zmiany `getAuthRouteMode()` dla `/v2`.
- Brak dużego refaktoru organizacji schem.

### Known limitations — do dopisania w `V2_MIGRATION.md`

1. **`apiKey` w SDK nie działa dla `/v2/files` i `/v2/folders`**, bo `/v2` nie jest dual-auth w backend middleware (`getAuthRouteMode()` w `apps/backend/src/middleware/auth.ts`). Server-to-server użytkownik z API key dostanie 401 na `client.files.list()` i `client.folders.list()`. Działa dla:
   - `client.admin.*` (prefix `/admin` jest dual)
   - `client.mainStorage.*` (prefix `/main` jest dual)
   - `client.app.*` (prefix `/app` jest dual)
   - `client.public.*` (no-auth path)

   Do rozwiązania w późniejszej iteracji backendu (poza sekcją 1).

2. **`/admin/users` używa offset pagination, nie cursor.** Backend zależy od Appwrite SDK, który ma offset/limit. Niespójne z resztą V2 (audit-log używa cursor). Do rozwiązania jak/jeśli kiedyś zmieni się backend Appwrite.

3. **Rozjazd liczby endpointów admin: 10 vs 11.** `V2_MIGRATION_PLAN.md` §1 mówi "admin (10 endpointów)", backend ma 11 handlerów. Aktualizujemy `V2_MIGRATION.md` przy zamykaniu sekcji.

4. **Bulk response shape w V2 beta zmienia się** z flat legacy shape na `{ processed, failed[] }`. Changeset zawiera wprost: `BREAKING in V2 beta: bulk response shape changed`.

## Test strategy

### SDK (`vitest`)

- Unit per resource: mock `fetch`, asercja na method/path/body/query/headers
- Public endpoints: explicite test, że `Authorization` header jest **nieobecny**, nawet gdy `getToken` lub `apiKey` skonfigurowane
- Auth tests:
  - `getToken` only → wysyła `Bearer ${token}`
  - `apiKey` only → wysyła `Bearer ${apiKey}`
  - both credentials → constructor throws
  - no credentials → no `Authorization`
- Bulk schema parsing: response `{processed, failed}` przechodzi przez `v2BulkResponseSchema`
- Error parsing:
  - known code zachowany jako `V2ErrorCode`
  - unknown code → `code: 'unknown'`, `rawCode: <oryginalny string>`
- `client.public.buildDownloadUrl` — slug i token poprawnie encoded, brak fetch

### Backend (`@cloudflare/vitest-pool-workers`)

- `POST /v2/files/bulk`:
  - `trash`
  - `restore`
  - `move` z jawnym `folder_id`
  - `delete` (permanent)
- `POST /v2/folders/bulk`:
  - `trash`
  - `restore`
  - `move` z jawnym `parent_id`
  - `delete` (permanent)
  - cycle prevention → `failed[]` z `code: 'conflict'`
- Partial success:
  - część ID istnieje → `processed[]`
  - część ID nie istnieje → `failed[]` z `code: 'not_found'`
- Bulk limit:
  - 101 IDs → `validation_error`
  - max 100 wynika z limitowania bound params D1
- Contract test:
  - backend `V2_ERROR_CODES` i SDK `V2_ERROR_CODES` są identyczne (`Set` equality + length check)

### Buildy/testy

- `pnpm --filter @unisource/sdk build`
- `pnpm --filter @unisource/sdk test`
- `pnpm --filter backend test`

## Wpływ na kolejne sekcje

- **Sekcja 2** (`upload.ts` → V2 + SDK): używa `apiKey` dla server-to-server upload (`/upload` jest dual auth), `V2ErrorCode`, ewentualnie `auth: 'none'` (jeśli upload mógłby być public — raczej nie). Bulk envelope nie powinien być potrzebny w upload, ale jeśli pojawi się bulk multipart, używa nowego shape.
- **Sekcja 3** (`releases.ts` → V2 + SDK): używa `apiKey` (`/releases` jest dual auth), `V2ErrorCode`, ewentualnie bulk envelope dla `releases.sync` (do decyzji w sekcji 3).
- **Sekcja 4** (`superadmin.ts` → V2): używa **backendowego** `V2ErrorCode`/`V2Error` jako wzorca. Superadmin jest internal i nie wystawia publicznego SDK resource w tej sekcji.

## Handoff dokumenty

Zgodnie z `V2_MIGRATION_PLAN.md` format:

- **`plans/v2-section-1-sdk-parytet.md`** — szczegółowy plan implementacji wygenerowany przez `superpowers:writing-plans` na bazie tego specu. Zawiera oba etapy (1.A i 1.B) z pełnymi krokami, plikami, testami.
- **`plans/v2-section-1-sdk-parytet-handoff.md`** — short, samodzielny handoff dla użytkownika do wklejenia do nowej sesji implementacyjnej. Zawiera notatkę: "Etap 1.A wykonaj inline; po zakończeniu i zielonych testach, dla 1.B otwórz fresh sesję z tym handoffem i pomiń Etap 1.A".

Decyzje już podjęte (idą do handoffu): wszystkie z sekcji "Decyzje architektoniczne" w tym specu.
