# V2 Migration Master Plan

> Master plan domknięcia migracji V2. Każda sesja domyka jedną sekcję end-to-end. Ten dokument NIE zawiera detali implementacyjnych — tylko zakres, sposób pracy, wzorce i kryteria gotowości. Szczegółowy plan piszę agent orkiestrujący per sekcja na podstawie tego dokumentu.

## Jak używać tego dokumentu

**Ty (user):** otwierasz nową sesję, wskazujesz na ten plik i mówisz: *"zajmij się sekcją X"*.

**Agent orkiestrujący (świeża sesja):** czyta ten plan, czyta źródła prawdy (sekcja niżej), analizuje zakres swojej sekcji, pisze szczegółowy plan implementacji, robi handoff dokument. **Nie implementuje sam.**

**Agent implementujący (kolejna świeża sesja):** dostaje od ciebie handoff dokument, realizuje plan zgodnie z workflow `superpowers:executing-plans` (lub `subagent-driven-development` jeśli sekcja tak każe).

---

## Workflow agenta orkiestrującego — obowiązuje dla każdej sekcji

1. **Pre-flight reading** (zawsze, w tej kolejności):
   - `V2_MIGRATION.md` — aktualny stan migracji
   - `api-v2-architecture.md` — kontrakt V2 (response shapes, error codes, D1/R2 zasady, observability, kryteria gotowości)
   - Ten dokument (master plan) — twoja sekcja
   - Pliki-wzorce wskazane w twojej sekcji (sekcja "Wzorce do naśladowania" niżej)
   - Pliki-target twojej sekcji (kod do zmigrowania)

2. **Analiza zakresu** — wylistowanie wszystkich handlerów / metod / endpointów do zmiany, identyfikacja zależności, wykrycie pułapek (np. własne `validationErrorHook`, dynamic SQL, R2 streaming).

3. **Brainstorming** (skill `superpowers:brainstorming`) — uzgodnienie z userem nieoczywistych decyzji projektowych zanim spiszesz plan. Bulk envelope, `trash` enum vs `is_trashed` bool, API-key path — to są pytania **architektoniczne**, nie implementacyjne. Przykładowe pytania per sekcja w opisie sekcji niżej.

4. **Pisanie planu** (skill `superpowers:writing-plans`) — szczegółowy plan implementacji w `plans/v2-section-N-<short-name>.md`. Plan ma być wykonywalny przez świeżego agenta bez kontekstu z twojej sesji.

5. **Handoff dokument** — `plans/v2-section-N-<short-name>-handoff.md` (format poniżej). To jest co user wkleja do nowej sesji implementacyjnej.

6. **Co NIE robi orkiestrator:** nie pisze kodu produkcyjnego, nie odpala buildów, nie commituje. Może odpalić read-only komendy do analizy (grep, read, ls) i odpalić testy istniejących wzorców żeby potwierdzić że jego założenia są aktualne.

---

## Źródła prawdy — pre-flight reading

| Plik | Co tam jest | Kiedy czytać |
|---|---|---|
| `V2_MIGRATION.md` | Stan migracji, lista zmigrowanych routes, znane drobiazgi, dług techniczny, definicja końca | Zawsze, pierwsza rzecz |
| `api-v2-architecture.md` | Kontrakt V2: response shapes, error codes, query standard, D1/R2/Workers zasady, observability, test strategy, kryteria gotowości | Zawsze |
| `apps/backend/src/lib/v2/errors.ts` | `V2Error`, kody błędów (zamknięty zestaw) | Każda sekcja backend |
| `apps/backend/src/lib/v2/zodHook.ts` | `v2ValidationHook` — zastępca własnych `validationErrorHook` | Sesje 2, 3, 4 |
| `apps/backend/src/lib/v2/log.ts` | `logV2Request`, `v2RequestIdGuard` | Każda sekcja backend |
| `apps/backend/src/lib/v2/cursor.ts` | Helpery cursor pagination | Każda sekcja backend listingowa |
| `apps/backend/src/lib/v2/resource.ts` | Helpery zasobu (cursor, sort allowlist, etc.) | Każda sekcja backend |
| `packages/unisource-sdk/src/v2/transport.ts` | Fundament SDK V2 (auth, error parsing, query serialization) | Każda sekcja SDK |
| `packages/unisource-sdk/src/v2/client.ts` | Kompozycja klienta — gdzie rejestrować nowe zasoby | Każda sekcja SDK |
| `packages/unisource-sdk/src/v2/schemas.ts` | Wspólne Zod schematy (errors, bulk, list page) | Każda sekcja SDK |

---

## Wzorce do naśladowania

### Backend — istniejące zmigrowane routes

| Plik | Cechy charakterystyczne | Dobry wzorzec dla |
|---|---|---|
| `apps/backend/src/routes/admin.ts` | 11 handlerów, cursor pagination, V2Error, `v2ValidationHook` | Sekcja 4 (`superadmin.ts`) — duży route z wieloma handlerami |
| `apps/backend/src/routes/fileRecords.ts` | 8 handlerów, R2 + Appwrite, najwięcej error pathów | Sekcja 2 (`upload.ts`) — error handling przy storage |
| `apps/backend/src/routes/mainStorage.ts` | 5 handlerów, czysta cursor pagination | Każdy listing |
| `apps/backend/src/routes/folders.ts` | 6 handlerów, recursive CTE, batch delete | Sekcja 3 (`releases.ts`) — złożone SQL + batch ops |
| `apps/backend/src/routes/public.ts` | 302 redirect, signed tokens, `gone` error code | Każdy edge case poza standardowym JSON |
| `apps/backend/src/routes/userFiles.ts` | Plan 2 contract `/files/:id` | Każdy zasób z lifecycle update/delete/restore |
| `apps/backend/src/routes/v2/files.ts`, `v2/folders.ts` | Nowy V2 namespace, dedykowany `v2ErrorHandler` | Nowe namespace'y V2 |

### SDK — istniejące zasoby V2

| Plik | Cechy | Dobry wzorzec dla |
|---|---|---|
| `packages/unisource-sdk/src/v2/transport.ts` | Fundament: fetch, auth, error parsing, query serialization | Edycja transportu (Sekcja 1: API-key) |
| `packages/unisource-sdk/src/v2/client.ts` | Kompozycja klienta (47L), rejestracja zasobów | Każda sesja dodająca nowy zasób |
| `packages/unisource-sdk/src/v2/resources/files.ts` | Pełne pokrycie V2, listing + bulk | Każdy zasób z bulk |
| `packages/unisource-sdk/src/v2/resources/folders.ts` | Pełne pokrycie V2, listing + breadcrumbs + bulk | Sekcja 1 (folders CRUD do dobudowania) |
| `packages/unisource-sdk/src/v2/resources/main-storage.ts` | Plan 2 contract, listing + CRUD per id | Sekcja 1 (myFiles), 2 (upload), 3 (releases) |
| `packages/unisource-sdk/src/v2/resources/user-files.ts` | Plan 2 `/files/:id*` | Każdy zasób per id z lifecycle |

### Konwencje commitów (CLAUDE.md)

`feat(backend|sdk|frontend|root):`, `fix(...)`, `refactor(...)`, `chore(...)`. Add `!` for breaking. SDK: nigdy ręcznie `version` — `pnpm changeset`.

---

## Sekcja 1 — SDK V2 do parytetu z gotowym backendem + dług transportu

### Cel
SDK V2 pokrywa wszystkie publiczne endpointy backendu, które już mają shape V2. Plus uporządkowany transport (API-key path, typowany `V2ErrorCode`).

### Zakres (high-level)
- Backend (gotowy V2) ⇄ SDK V2 (do dobudowania): `folders` CRUD, `myFiles` listy/move, `admin` (10 endpointów), `public` (3 endpointy)
- Transport: API-key path obok `Bearer`
- Errors: typowany enum `V2ErrorCode` w SDK
- Backend cleanup: scalić `apps/backend/src/routes/v2/files.legacy.ts` z `v2/files.ts`
- Decyzja architektoniczna do podjęcia z userem PRZED planem: bulk envelope (obecne `{success, processed_count, failed_ids}` flat vs docelowe `{processed[], failed[]}` z `api-v2-architecture.md` §4.3). Backend i SDK muszą być zgodne.

### Sposób
**Subagenci równolegle.** Zadania są na rozłącznych plikach/zasobach, backend już V2, brak zależności sekwencyjnej. Skill: `superpowers:dispatching-parallel-agents` + `subagent-driven-development`.

Sugerowany podział na 4 worktree (sub-task per agent):
1. SDK: `folders` CRUD + `myFiles` listy/move
2. SDK: `admin` (10 endpointów) + `public` (3 endpointy)
3. SDK: transport API-key path + typowany `V2ErrorCode` enum
4. Backend: scalenie `v2/files.legacy.ts` z `v2/files.ts`

Pliki gorące (`client.ts`, `schemas.ts`) — orkiestrator scala eksporty z gałęzi po zakończeniu wszystkich subagentów.

### Wzorce
- SDK: `resources/folders.ts` (pełny zasób z listing+bulk), `resources/main-storage.ts` (Plan 2 lifecycle), `transport.ts` (do edycji)
- Backend cleanup: `routes/v2/files.ts` jako target shape

### Pytania architektoniczne do brainstormingu z userem
- Bulk envelope: flat vs `{processed[], failed[]}`? Migracja istniejących callerów?
- API-key path: jak jest przekazywane API key do `UnisourceV2Client` constructora? `apiKey` opcja vs `getToken: () => 'apikey:xyz'`?
- `V2ErrorCode` enum — czy jako exported `enum`, `union type`, czy `const object as const`?

### Definicja końca
- `pnpm --filter @unisource/sdk build` — zielony
- `pnpm --filter @unisource/sdk test` — zielony (testy schematów + klienta z `api-v2-architecture.md` §10)
- `pnpm --filter backend test` — zielony (po cleanupie `v2/files.legacy.ts`)
- Changeset opublikowany dla SDK (minor bump, nowe metody)
- `V2_MIGRATION.md` zaktualizowany: liczba metod SDK, status czterech checkboxów z definicji końca które dotyczą tej sekcji
- Bulk envelope decyzja udokumentowana w `V2_MIGRATION.md` (nawet jeśli wybrany wariant „zostawiamy flat", to musi być świadoma decyzja, nie zaniedbanie)

---

## Sekcja 2 — `upload.ts` backend → V2 + `UnisourceV2Client.upload.*`

### Cel
Najtrudniejszy route legacy migrowany do V2, plus pełny flow uploadu w SDK V2.

### Zakres (high-level)
- Backend: `apps/backend/src/routes/upload.ts` (827L, 9 handlerów). Endpointy: `/upload/r2/init`, `/upload/appwrite/init`, `/upload/complete`, `/upload/fail`, multipart create/sign-part/list-parts/complete/abort.
- SDK: `UnisourceV2Client.upload.*` + `upload.multipart.*`. Zgodność z V2 envelope.
- Usunięcie własnego `validationErrorHook` w `upload.ts` na rzecz `v2ValidationHook`.

### Sposób
**Inline sekwencyjnie.** Backend → SDK w obrębie sesji (SDK potrzebuje finalnych schematów po V2). Subagenci tutaj nie pomogą — to jeden duży, spójny flow z dużą ilością wspólnego stanu (schematy, error codes, request shapes). Skill: `superpowers:executing-plans` + `test-driven-development`.

### Wzorce
- Backend: `routes/fileRecords.ts` (storage error pathy), `routes/mainStorage.ts` (cursor pagination jeśli listingi są w upload), `routes/folders.ts` (batch ops jeśli multipart aborts)
- SDK: `resources/main-storage.ts` (Plan 2 lifecycle), `resources/files.ts` (jeśli upload zwraca file resource)
- `api-v2-architecture.md` §7 Strategia R2 — multipart pozostaje preferowaną ścieżką, presigned URL, cleanup idempotentny

### Pytania architektoniczne do brainstormingu z userem
- `UnisourceV2Client.upload` — zasób top-level czy nested (np. `upload.r2`, `upload.appwrite`)? Spójnie z legacy `UnisourceClient`?
- Multipart shape — same kształty co legacy czy okazja do uproszczenia?
- Czy `upload.fail` ma sens w V2 czy zastąpić go automatycznym cleanupem przez Queue (`api-v2-architecture.md` §8)?

### Definicja końca
- Backend testy `upload.ts` zielone (vitest-pool-workers, full multipart flow)
- SDK build + testy schematów + testy klienta zielone
- Changeset SDK
- `V2_MIGRATION.md` aktualizacja: 60→69/101 handlerów, sekcja "Pozostałe legacy" zmniejszona, `upload.ts` przeniesiony do "Zmigrowane do V2"
- Brak `validationErrorHook` w `upload.ts` (potwierdzone grep)

---

## Sekcja 3 — `releases.ts` backend → V2 + `UnisourceV2Client.releases.*`

### Cel
Drugi złożony route + odpowiedniki w SDK.

### Zakres (high-level)
- Backend: `apps/backend/src/routes/releases.ts` (596L, 14 handlerów). Endpointy: upload init/complete/fail + multipart + list/get/latest/update/delete/sync.
- SDK: `UnisourceV2Client.releases.*` + multipart. Pokrycie pełne (14 endpointów).
- Usunięcie własnego `validationErrorHook` w `releases.ts`.

### Sposób
**Inline sekwencyjnie.** Tak jak Sekcja 2 — jeden orkiestrator, backend → SDK. Skill: `superpowers:executing-plans` + `test-driven-development`.

### Wzorce
- Backend: `routes/fileRecords.ts` (jeśli release upload jest podobny do file upload), `routes/folders.ts` (jeśli releases mają subtree-like operations), `routes/mainStorage.ts` (listing)
- SDK: `resources/folders.ts` (listing + breadcrumbs jeśli releases mają versioning/history), `resources/files.ts` (bulk jeśli `sync` to bulk op)

### Pytania architektoniczne do brainstormingu z userem
- `releases.sync` — co to dokładnie robi? Czy w V2 zostaje, czy zastępujemy lepszą semantyką?
- `releases.latest` — czy ma być w `app.*` (zgodnie z istniejącym `app.releases.latest`) czy w `releases.*`? Czy duplikujemy?
- Multipart releases — wspólny shape z multipart upload (Sekcja 2) czy osobne?

### Definicja końca
- Backend testy `releases.ts` zielone
- SDK build + testy zielone
- Changeset SDK
- `V2_MIGRATION.md` aktualizacja: 69→83/101 handlerów
- Brak `validationErrorHook` w `releases.ts`

---

## Sekcja 4 — `superadmin.ts` backend → V2 (internal, bez SDK)

### Cel
Ostatni route legacy. Internal — nie wystawiamy w SDK.

### Zakres (high-level)
- Backend: `apps/backend/src/routes/superadmin.ts` (312L, 18 handlerów). Dynamic SQL, brak V2 helperów, chroniony przez CF Access.
- Migracja: V2Error, `v2ValidationHook`, cursor pagination, `is_trashed: boolean`, allowlista kolumn dla dynamic SQL (per `api-v2-architecture.md` §6 — sort allowlist, nie raw client values).

### Sposób
**Inline lub 2 subagenty na rozłączne grupy handlerów** (decyzja orkiestratora po analizie — np. service-level vs user-level vs system-level). Skill: `superpowers:executing-plans` (jeśli inline) lub `subagent-driven-development` (jeśli 2 subagenty).

Brak SDK → mniejsza powierzchnia, mniej zależności między plikami niż w Sekcjach 2/3. Decyzja zależy od tego, czy orkiestrator znajdzie naturalne, rozłączne grupy.

### Wzorce
- `routes/admin.ts` — najbliższy odpowiednik (admin-level, podobna powierzchnia handlerów)
- `routes/fileRecords.ts` — error pathy
- `api-v2-architecture.md` §6 — D1 zasady (zwłaszcza dynamic sort allowlist, bo `superadmin` ma dynamic SQL)

### Pytania architektoniczne do brainstormingu z userem
- Czy zachowujemy wszystkie 18 handlerów, czy któreś są martwe / do usunięcia przy okazji?
- Dynamic SQL w `superadmin` — czy zostaje (z allowlistą), czy zastępujemy stałymi query?
- Czy emitujemy `request_id` i pełne logi (`api-v2-architecture.md` §8) tak samo jak public routes, mimo że są internal?

### Definicja końca
- Backend testy `superadmin.ts` zielone
- `V2_MIGRATION.md` aktualizacja: 83→101/101 handlerów (100%)
- Brak `validationErrorHook` w `superadmin.ts`
- Wszystkie checkboxy w sekcji "Definicja skończonej refaktoryzacji V2" zaznaczone (lub odznaczone z uzasadnieniem, jeśli któryś nie dotyczy)
- Otwarcie ścieżki do dyskusji o merge `beta` → `main` (już poza zakresem refaktoryzacji)

---

## Format handoff dokumentu

Dokument przekazywany przez ciebie (user) do nowej, czystej sesji implementującej. Lokalizacja: `plans/v2-section-N-<short-name>-handoff.md`. Krótki, samowystarczalny.

```markdown
# V2 Section N: <name> — Handoff

## Co masz zrobić
Zrealizować plan w `plans/v2-section-N-<short-name>.md` zgodnie z workflow `superpowers:executing-plans` (lub `subagent-driven-development` jeśli plan tak każe — sprawdź pierwszą sekcję planu).

## Pre-flight reading (w tej kolejności)
1. `V2_MIGRATION_PLAN.md` — sekcja N (kontekst sekcji)
2. `V2_MIGRATION.md` — aktualny stan
3. `api-v2-architecture.md` — kontrakt V2
4. `plans/v2-section-N-<short-name>.md` — twój plan
5. Wzorce wskazane w planie (sekcja "Wzorce")

## Branch
`beta` (nie `main` — V2 zostaje na `beta` do końca refaktoryzacji)

## Zakres pracy
<jedno zdanie: co konkretnie ma być na końcu>

## Decyzje już podjęte (z brainstormingu orkiestratora)
- <decyzja 1>
- <decyzja 2>

## Co NIE jest w zakresie
- <wszystko poza tą sekcją z `V2_MIGRATION_PLAN.md`>
- frontend, `UnisourceClient` legacy, merge `beta` → `main`

## Definicja końca
- <kopia z planu>

## Po zakończeniu
1. Skill `superpowers:verification-before-completion` — uruchom buildy/testy z definicji końca, pokaż output
2. Zaktualizuj `V2_MIGRATION.md` (liczby, checkboxy z sekcji "Definicja skończonej refaktoryzacji V2")
3. Skill `superpowers:requesting-code-review` przed merge'em (review na branchu `beta`)
4. Skill `superpowers:finishing-a-development-branch` — zaproponuj userowi opcje (merge / PR / cleanup) — **nie merguj sam do `main`**
```

---

## Kolejność i zależności pomiędzy sesjami

```
Sesja 1 (SDK do parytetu + transport)
   │
   ▼ (transport finalny → SDK upload/releases mogą się o niego oprzeć)
Sesja 2 (upload e2e)
   │
   ▼ (multipart shape uzgodniony → releases reuse)
Sesja 3 (releases e2e)
   │
   ▼
Sesja 4 (superadmin, internal)
   │
   ▼
Decyzja: merge `beta` → `main` (poza zakresem)
```

**Twarde zależności:**
- Sesja 2 → Sesja 1: transport API-key + `V2ErrorCode` enum. Bez tego upload SDK będzie miał niespójny error handling.
- Sesja 3 → Sesja 2: shape multipart uzgodniony w Sekcji 2 może być reusowany w Sekcji 3.

**Miękkie zależności:**
- Sesja 4 niezależna od 2 i 3 pod kątem kodu, ale powstaje jako ostatnia żeby `V2_MIGRATION.md` zamknąć jednym ruchem.

**Każda sesja powinna być oddzielna:**
- Świeży kontekst per sekcja (nie ciągniemy bagażu z poprzedniej)
- Mniejsze ryzyko niespójności stylu między sekcjami
- Łatwiejszy rollback per sekcja jeśli coś pójdzie nie tak

---

## Zasady wspólne dla wszystkich sesji (skróty z `api-v2-architecture.md`)

Agent orkiestrujący ma to zweryfikować w swoim planie. Agent implementujący ma się trzymać:

- **Response shapes:** `{items, page: {limit, next_cursor}}` listing, `{item}` single, `{processed[], failed[]}` bulk (do potwierdzenia w Sekcji 1), `{error: {code, message, request_id?, details?}}` error.
- **Error codes:** zamknięty zestaw — `validation_error`, `cursor_invalid`, `search_too_long`, `unauthorized`, `forbidden`, `not_found`, `rate_limited`, `internal_error`, `conflict`, `bad_gateway`, `gone`. Plus dziedzinowe (np. `cycle_detected`, `target_folder_trashed`, `bulk_limit_exceeded`).
- **Cursor pagination** wszędzie zamiast offset.
- **Bulk max 100 IDs** (limit D1 bound parameters).
- **Dynamic SQL** tylko z allowlisty kolumn — nigdy z surowej wartości klienta.
- **`request_id`** w każdym response (do tracingu).
- **`is_trashed: boolean`** (V2 shape, nie legacy `1/0`).
- **Workers-native:** brak global state, kontrolowane Promises, `waitUntil` tylko dla niekrytycznych side-effectów, R2 streaming nie buforowanie.
- **Bindings first:** D1, R2, Rate Limiting przez `env`, nie przez REST API.
- **Testy:** `@cloudflare/vitest-pool-workers` dla route'ów, schematów SDK i flow e2e.
