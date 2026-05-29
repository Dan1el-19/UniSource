# V2 Section 3: `releases.ts` + `UnisourceV2Client.releases.*` — Handoff

## Co masz zrobić

Zrealizować plan w `plans/v2-section-3-releases.md` zgodnie z workflow `superpowers:executing-plans` + `superpowers:test-driven-development`. Pracuj inline sekwencyjnie, jeden agent, backend → SDK → integration → docs.

## Pre-flight reading

1. `V2_MIGRATION_PLAN.md` — §Sekcja 3.
2. `V2_MIGRATION.md` — aktualny stan po Sekcji 2: backend `68/100`, SDK V2 `57 metod / 12 zasobów`.
3. `api-v2-architecture.md` — §4 response/error/bulk, §6 D1, §7 R2, §8 observability, §10 test strategy.
4. `plans/v2-section-3-releases.md` — szczegółowy plan implementacji.
5. Wzorce:
   - `apps/backend/src/routes/upload.ts` — Section 2 V2 upload/multipart shapes.
   - `packages/unisource-sdk/src/v2/upload-schemas.ts` and `packages/unisource-sdk/src/v2/resources/upload.ts` — SDK V2 upload pattern.
   - `apps/backend/test/integration/v2-upload-end-to-end.test.ts` — SDK ↔ backend fetch-swap integration pattern.
   - `apps/backend/src/lib/v2/{errors,zodHook,log}.ts` — V2 helpers.

## Branch

`beta`. Nie merguj do `main`; merge `beta` → `main` jest poza zakresem refaktoryzacji.

## Zakres pracy

Backend `apps/backend/src/routes/releases.ts` ma zostać zmigrowany do V2 shape dla wszystkich 14 handlerów, a `UnisourceV2Client.releases.*` ma dostać pełne pokrycie release upload, multipart, list/get/latest/update/delete/sync.

## Decyzje architektoniczne

1. `releases.sync` zostaje w V2 jako admin reconciliation/import, ale zwraca `{ processed, failed[] }` zamiast legacy `{ synced, results }`.
2. `client.releases.latest()` zostaje i mapuje do `GET /releases/latest`; `client.app.latestRelease()` nadal mapuje do `GET /app/releases/latest` i nie jest zmieniany.
3. Multipart releases re-używa Section 2 upload V2 shapes.
4. `POST /releases/upload/fail` zostaje, bo master plan wymaga 14 endpointów release parity.
5. Legacy `UnisourceClient` i `packages/unisource-sdk/src/releases.ts` są frozen i nie są modyfikowane.
6. Nie dodawaj nowych V2 error codes; użyj istniejących.

## Co NIE jest w zakresie

- `apps/frontend`.
- `UnisourceClient` legacy.
- `GET /app/releases/latest` poza upewnieniem się, że nie został zepsuty.
- `superadmin.ts`.
- Backend auth dual-auth dla `/v2/*` known limitation.
- Merge `beta` → `main`.

## Definicja końca

- [ ] `pnpm --filter backend test` zielony.
- [ ] `pnpm --filter @unisource/sdk build` zielony.
- [ ] `pnpm --filter @unisource/sdk test` zielony.
- [ ] `.changeset/v2-section-3-releases.md` istnieje z minor bump dla `@unisource/sdk`.
- [ ] `V2_MIGRATION.md` zaktualizowany: backend `68/100` → `82/100`, SDK V2 `57 metod / 12 zasobów` → `71 metod / 13 zasobów`.
- [ ] `rg "validationErrorHook" apps/backend/src/routes/releases.ts` zwraca pustą listę.
- [ ] Wszystkie 14 endpointów z matrixa w planie ma test route albo integration coverage.

## Po zakończeniu

1. Użyj `superpowers:verification-before-completion` i pokaż output z komend definicji końca.
2. Użyj `superpowers:requesting-code-review` przed merge/PR.
3. Użyj `superpowers:finishing-a-development-branch` i zaproponuj opcje. Nie merguj sam do `main`.

## Commit conventions

- `refactor(backend): ...` dla migracji handlerów do V2.
- `feat(sdk): ...` dla `UnisourceV2Client.releases.*`.
- `test(backend,sdk): ...` dla integration testu.
- `docs(root): ...` dla `V2_MIGRATION.md`.
- SDK: nie edytuj `version` w `package.json` ręcznie.
