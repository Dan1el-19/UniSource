# V2 Section 2: `upload.ts` + `UnisourceV2Client.upload.*` — Handoff

## Co masz zrobić

Zrealizować plan w `plans/v2-section-2-upload.md` zgodnie z workflow `superpowers:executing-plans` + `superpowers:test-driven-development`. **Inline sekwencyjnie, jeden agent — NIE używać subagentów** (zgodnie z V2_MIGRATION_PLAN.md §Sekcja 2).

## Pre-flight reading (w tej kolejności)

1. `V2_MIGRATION_PLAN.md` — §Sekcja 2 (kontekst sekcji)
2. `V2_MIGRATION.md` — aktualny stan migracji (Sekcja 1 ukończona, 60/101 handlerów zmigrowanych)
3. `api-v2-architecture.md` — §4 (response/error/bulk shapes), §6 (D1), §7 (R2 strategy), §8 (observability)
4. `plans/v2-section-2-upload.md` — twój plan implementacji
5. Wzorce wskazane w planie:
   - `apps/backend/src/routes/fileRecords.ts` — V2 envelope, V2Error patterns, R2/Appwrite error pathy
   - `apps/backend/src/routes/mainStorage.ts` — listing + `is_trashed: boolean`
   - `apps/backend/src/lib/v2/{errors,zodHook,log,resource,cursor}.ts` — V2 helpers
   - `apps/backend/test/routes/v2/files.test.ts` — wzór testu V2 z `@cloudflare/vitest-pool-workers`
   - `apps/backend/test/upload-hardening.test.ts` — wzór mockowania R2/Appwrite (vi.mock)
   - `apps/backend/test/integration/v2-files-end-to-end.test.ts` — wzór SDK↔backend integration test
   - `packages/unisource-sdk/src/v2/resources/main-storage.ts` — wzór SDK V2 resource z method signatures `(args, signal?, options?)`
   - `packages/unisource-sdk/src/v2/transport.ts` — V2Request fundament (już gotowy po Sekcji 1)
   - `packages/unisource-sdk/src/v2/error-codes.ts` — V2_ERROR_CODES + `isV2ErrorCode`

## Branch

`beta` (NIE `main` — V2 zostaje na `beta` do końca refaktoryzacji V2; merge `beta` → `main` to osobna decyzja, poza zakresem tej sekcji).

## Zakres pracy

Backend `apps/backend/src/routes/upload.ts` zmigrowany do V2 envelope (8 handlerów, `/fail` usunięty), SDK `UnisourceV2Client.upload.*` z 8 metodami pokrywa pełen single + multipart flow, dwa nowe error codes (`file_too_large`, `quota_exceeded`) dodane do allowlisty V2 i contract testem zsynchronizowane SDK↔backend.

## Decyzje już podjęte (z brainstormingu orkiestratora)

1. **Lifecycle response shape** = `{ item: UploadRecord }` (V2 single-resource standard).
2. **SDK namespace** = flat: `client.upload.{r2Init, appwriteInit, complete, multipartCreate, multipartSignPart, multipartListParts, multipartComplete, multipartAbort}`.
3. **Init shape** = `{ item: UploadInitRecord }` z presigned_url etc. INSIDE.
4. **list-parts shape** = `{ items, page: { limit, next_cursor: null } }` (V2 list envelope, synthetic page).
5. **`file_too_large` 413** + **`quota_exceeded` 409** — dziedzinowe error codes w V2_ERROR_CODES allowlist; oba mają typed details (`{ max_bytes }` / `{ scope, requested_bytes }`).
6. **`POST /upload/fail` USUNIĘTY** w V2 — kwota zwalniana przez expiry (1h single, 7d multipart) lub Queue cleanup (poza scope sekcji 2). BREAKING vs legacy.
7. **`DELETE /upload/r2/multipart/abort` ZOSTAJE** — fizyczna operacja R2, nie tylko D1 flip; Cloudflare R2 best practice.
8. **`mainStorageForbiddenResponse` zamieniany inline** na `throw new V2Error('forbidden', 403, ...)` — helper jest używany TYLKO w upload.ts (sprawdzony grepem).
9. **Method signatures SDK** = `(primaryArgs, signal?, options?)` per wzór `client.folders.create`.
10. **Schema split**: `packages/unisource-sdk/src/uploads.ts` (legacy) FROZEN; nowe V2 schemy w `packages/unisource-sdk/src/v2/upload-schemas.ts`.
11. **Prefix `/upload/*` zostaje** — in-place migration (V2_MIGRATION.md §1).
12. **Legacy `UnisourceClient.upload.*` FROZEN** — żadnych zmian. Po sekcji 2 udokumentowane jako known limitation w V2_MIGRATION.md §4.1: legacy upload broken przeciwko `beta` (jak inne legacy contracts).
13. **Bez bulk endpoints** — upload to per-resource lifecycle.
14. **`sign-part` zostaje GET** — typowy S3 SDK pattern.
15. **Reuse istniejących Zod request schemas z `uploads.ts`** dla zValidator backendu (są stable). Nowe są tylko V2 response schemas + V2-specific request schemas (np. `v2UploadCompleteRequestSchema`) w `v2/upload-schemas.ts`.

## Co NIE jest w zakresie

- `apps/frontend` (admin panel) — pozostaje na `UnisourceClient` legacy.
- `UnisourceClient` (legacy SDK) — FROZEN, żadnych zmian.
- `releases.ts` (sekcja 3) i `superadmin.ts` (sekcja 4).
- Queue cleanup processor dla expired uploads — out of scope sekcji 2 (Queue cleanup wzmiankowany w V2_MIGRATION.md §5 jako follow-up).
- Backend auth dual-auth dla `/v2/*` (known limitation §4.1).
- Merge `beta` → `main`.

## Definicja końca

- [ ] `pnpm --filter backend test` — zielony, wszystkie testy upload.ts pokryte V2 envelope.
- [ ] `pnpm --filter @unisource/sdk build` — zielony.
- [ ] `pnpm --filter @unisource/sdk test` — zielony (schemy + klient + integration).
- [ ] Changeset SDK opublikowany (minor bump dla `@unisource/sdk`).
- [ ] `V2_MIGRATION.md` zaktualizowany: 60→68/100 handlerów (po usunięciu `/fail`), `upload.ts` przeniesiony do "Zmigrowane do V2", nowe error codes w §"Co to jest standard V2", BREAKING note w §4.1 Known Limitations.
- [ ] Brak `validationErrorHook` w `upload.ts` (`grep -n "validationErrorHook" apps/backend/src/routes/upload.ts` zwraca pustą listę).
- [ ] Brak `mainStorageForbiddenResponse` importu w `upload.ts`.
- [ ] Brak `upload.fail` handler w `upload.ts`.
- [ ] Backend contract test SDK↔backend error codes zielony (`apps/backend/test/lib/v2/error-codes.contract.test.ts`).
- [ ] `apps/backend/test/service-isolation.test.ts` zielony po rebase (cross-service isolation testowane na `/upload/complete` zamiast usuniętego `/fail`).

## Po zakończeniu

1. **Skill `superpowers:verification-before-completion`** — uruchom buildy/testy z definicji końca, pokaż output, potwierdź zielone wszystko przed dalszymi krokami.
2. **Sprawdź checklisty self-review** w ostatniej sekcji planu.
3. **Skill `superpowers:requesting-code-review`** — przed merge'em (review na branchu `beta`, NIE merge do main).
4. **Skill `superpowers:finishing-a-development-branch`** — zaproponuj userowi opcje (merge / PR / cleanup) — **nie merguj sam do `main`**. V2 zostaje na `beta` aż osiągnie kompletność i stabilność (po sekcjach 3-4).

## Commit message conventions

Per CLAUDE.md:
- `feat(sdk):` / `feat(backend):` — nowe metody SDK, nowy code path backendu.
- `refactor(backend):` — migracja istniejącego handlera do V2 envelope.
- `refactor(backend)!:` — z `!` dla BREAKING (Task 6: removal `/upload/fail`).
- `chore(backend):` / `chore(sdk):` — cleanup, config, importy.
- `docs(root):` — `V2_MIGRATION.md` update.
- `test(backend):` — integration tests.
- SDK: NIGDY ręcznie `version` w `package.json` — `pnpm changeset` + `pnpm changeset version` (jeśli executor potrzebuje pisać changeset, robi to przez `cat > .changeset/...md` lub `pnpm changeset`).

## Uwagi techniczne dla executora

- **TDD discipline:** każdy handler dostaje failing test → migrate → green test → commit. Nie skracaj. Sekcja 2 to złożony flow z R2/Appwrite/D1 — testy chronią przed regresjami.
- **Mocking R2/Appwrite:** wzorzec z `apps/backend/test/upload-hardening.test.ts` jest kanoniczny dla mockowania storage primitives w `vitest-pool-workers`. Dla success-path testów `/complete` i `/multipart/complete` re-use tego pattern albo migruj zatomizowane testy do `upload-hardening.test.ts` (TAM mocki już są skonfigurowane). W `apps/backend/test/routes/v2/upload.test.ts` zostaw tylko testy które nie wymagają mock R2 (404, validation_error, file_too_large, quota_exceeded — te działają bez storage mocks).
- **Gdyby integration test (Task 16) wymagał patcha `globalThis.fetch`** i ten pattern nie działał w `vitest-pool-workers`, sprawdź dokładnie jak `apps/backend/test/integration/v2-files-end-to-end.test.ts` to robi (wymagana strict reuse — w runtime Worker swap `globalThis.fetch` ma swoje gotchas). Worst-case: napisz integration test bez SDK, czysto na app.fetch (ale wtedy traci sens "SDK↔backend") — jeśli skoroś problem ten występuje, zatrzymaj się i zapytaj użytkownika o decyzję, **nie mergeuj zielonych testów które nie weryfikują SDK<->backend wire shape**.
- **Schemas z `uploads.ts` (legacy):** request schemas (`uploadR2InitRequestSchema`, `uploadAppwriteInitRequestSchema`, `uploadLifecycleRequestSchema`, `multipartCreateRequestSchema`, `multipartSignPartQuerySchema`, `multipartListPartsQuerySchema`, `multipartCompleteRequestSchema`, `multipartAbortRequestSchema`) są używane przez `zValidator` w backendzie. Zostają używane — backend przyjmuje stary kontrakt request body, response shape różni się. Nie zmieniaj `uploads.ts`.
- **`upload.ts` jest hybrydowy w trakcie migracji:** Tasks 3-11 migrują po jednym handlerze. Pomiędzy taskami plik zawiera jeden zmigrowany handler i resztę legacy — to OK, ale `validationErrorHook` (legacy helper) i nowe `v2ValidationHook` współistnieją. Task 12 finalnie usuwa legacy helper. Aż do Task 12 pozostawiamy `function validationErrorHook(...)` w pliku, ale jego usage znika handler-by-handler.

## Time estimate

8-12 godzin łączny effort dla świeżego agenta z dobrym rozumieniem TypeScript + Cloudflare Workers + Hono. Najwięcej czasu na Task 5 (`/complete`) + Task 10 (`/multipart/complete`) — tam jest najwięcej error pathów + interakcja z R2/Appwrite + tests z mockami.
