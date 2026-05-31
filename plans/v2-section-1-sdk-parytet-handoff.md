# V2 Section 1 — SDK Parity + Transport Debt — Handoff

## Co masz zrobić

Zrealizować plan w `plans/v2-section-1-sdk-parytet.md`. Plan ma DWA etapy z różnymi sub-skillami:

- **Etap 1.A** (Tasks 1-16) — REQUIRED SUB-SKILL: `superpowers:executing-plans`. Wykonanie inline, sekwencyjnie, jeden agent. NIE używać subagentów.
- **Etap 1.B** (Tasks 17-24) — REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Trzy subagenty równolegle w worktree, potem orkiestrator scala i finalizuje.

> **Jeśli zaczynasz świeżą sesję dla Etapu 1.B (po zakończeniu 1.A i pushed do `beta`):** pomiń Tasks 1-16, zacznij od Task 17. Etap 1.A musi być zielony przed Etapem 1.B.

## Pre-flight reading (w tej kolejności)

1. `V2_MIGRATION_PLAN.md` — sekcja 1 (kontekst całej sekcji w master planie)
2. `V2_MIGRATION.md` — aktualny stan migracji V2
3. `api-v2-architecture.md` — kontrakt V2 (response shapes, error codes, D1/R2 zasady)
4. `docs/superpowers/specs/2026-05-28-v2-section-1-sdk-parytet-design.md` — spec sekcji 1 (4 decyzje architektoniczne)
5. `plans/v2-section-1-sdk-parytet.md` — twój plan
6. Wzorce wskazane w planie (file structure, sekcja "Wspólne zasady" w Etapie 1.B)

## Branch

`beta` (nie `main` — V2 zostaje na `beta` do końca refaktoryzacji V2). Wszystkie 4 sekcje (1, 2, 3, 4) trzymamy na `beta` aż osiągniemy kompletność.

## Zakres pracy

SDK V2 osiąga parytet z backendem dla folders/myFiles/admin/public; bulk envelope, V2ErrorCode i auth API-key path są ujednolicone. Backend cleanup: `apps/backend/src/routes/v2/files.legacy.ts` znika, jeden `POST /v2/<resource>/bulk` per zasób z dyskryminowanym union.

## Decyzje już podjęte (z brainstormingu orkiestratora)

- **D1 Bulk envelope:** S3-style `{ processed: string[], failed: [{ id, code, message }] }`. Stary flat shape zostaje TYLKO w `legacy-draft.ts` dla `UnisourceClient.v2.*` (deprecated frozen).
- **D2 Auth:** `apiKey?` + `getToken?` w `UnisourceV2ClientConfig`, oba podane → constructor throws. Plus per-request `auth: 'default' | 'none'` w `V2RequestOptions` (`client.public.*` zawsze używa `'none'`).
- **D3 `V2ErrorCode`:** `as const` array, **dwie kopie** (SDK + backend), backend NIE importuje z SDK. Contract test `apps/backend/test/lib/v2/error-codes.contract.test.ts` pilnuje synchronizacji. `UnisourceV2Error.code: V2ErrorCode | 'unknown'` + opcjonalny `rawCode`.
- **D4 Bulk endpoint:** `POST /v2/<resource>/bulk` z dyskryminowanym union body po `action: 'trash' | 'restore' | 'move' | 'delete'`. `move` wymaga JAWNEGO `folder_id`/`parent_id` (`null` = root, ale musi być w body). Cycle prevention w folders zwraca `code: 'conflict'` (NIE `cycle_detected` — NIE rozszerzamy `V2_ERROR_CODES`).
- **Etap 1.A inline (sekwencyjnie):** fundament SDK + backend bulk endpoints + DB refactor + tests. Subagentów NIE używamy w 1.A — zmiany są mocno powiązane.
- **Etap 1.B równolegle (3 subagenty):** folders CRUD + myFiles, admin (11 metod), public (3 metody z `auth: 'none'`).

## Co NIE jest w zakresie

- **Frontend** — bez zmian. Branch `beta` nie jest produkcyjny (`V2_MIGRATION.md` §3).
- **`UnisourceClient` (legacy) i `client.v2.*` w nim** — `@deprecated FROZEN`, nie ruszamy.
- **Backend `upload.ts`, `releases.ts`, `superadmin.ts`** — sekcje 2, 3, 4. Sekcja 1 ich nie tyka.
- **Backend auth middleware** — `getAuthRouteMode()` w `apps/backend/src/middleware/auth.ts` nadal nie listuje `/v2` jako dual. `apiKey` w SDK NIE działa dla `/v2/files`/`/v2/folders` po sekcji 1 (known limitation, do rozwiązania w późniejszej iteracji backendu).
- **Refaktor organizacji schem SDK** — `legacy-draft.ts` zostaje, struktura plików `v2/` bez przeprojektowania.
- **Merge `beta` → `main`** — V2 nie wraca do `main` przed kompletnością (po sekcjach 2-4).

## Definicja końca sekcji 1

Kopia z `plans/v2-section-1-sdk-parytet.md` (Task 16 + Task 24):

**Etap 1.A:**
- SDK build i test zielone
- Backend test zielony (włącznie z contract test `V2_ERROR_CODES`)
- `apps/backend/src/routes/v2/files.legacy.ts` usunięty
- `POST /v2/files/bulk` i `POST /v2/folders/bulk` działają dla 4 akcji
- Cycle prevention w folder bulk move zwraca `code: 'conflict'`
- `client.files.bulk(...)` i `client.folders.bulk(...)` używają nowego `/bulk` i nowego envelope
- Brak regresji w istniejących SDK testach
- Etap 1.A pushed do `origin/beta`

**Etap 1.B:**
- `client.folders.create / get / update / delete / restore` (5 nowych metod CRUD, plus istniejące `list / breadcrumbs / bulk`)
- `client.myFiles.list / listTrash / move` (nowy resource)
- `client.admin.*` 11 metod
- `client.public.getShareLink / unlockShareLink / buildDownloadUrl` (3 metody, `auth: 'none'`)
- Wszystkie subagent worktrees scalone do `beta`
- SDK build + test + backend test zielone
- Changeset SDK minor bump opublikowany
- `V2_MIGRATION.md` zaktualizowany (3/6 checkboxów z definicji końca V2 zaznaczone, Known Limitations dodane)

## Po zakończeniu

1. **Skill `superpowers:verification-before-completion`** — uruchom buildy/testy z definicji końca, pokaż output
2. **`V2_MIGRATION.md` zaktualizowany** (Task 23 w planie — pokrycie SDK, checkboxy, Known Limitations)
3. **Skill `superpowers:requesting-code-review`** przed merge'em (review na branchu `beta`)
4. **Skill `superpowers:finishing-a-development-branch`** — zaproponuj userowi opcje. **NIE merguj sam do `main`** — rekomendacja: zostawić `beta` otwarte, V2 nie wraca do `main` przed kompletnością.
