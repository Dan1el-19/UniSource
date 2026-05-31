# V2 Split Design

## Cel

Rozdzielenie kontraktów V1 legacy i V2 beta na niezależne rodziny ścieżek HTTP i niezależne kontrakty odpowiedzi, tak aby merge `beta` do `main` nie złamał produkcyjnych klientów legacy.

## Architektura

Dwie równoległe rodziny API rozdzielone prefiksem URL:

| Rodzina | Prefiks | Pliki route'ów | Kształt odpowiedzi | SDK |
|---------|---------|---------------|-------------------|-----|
| V1 legacy | `/upload`, `/folders`, `/my-files`, `/files`, `/admin`, `/admin/files`, `/main`, `/releases`, `/app`, `/public`, `/shares`, `/share-links`, `/superadmin` | `apps/backend/src/routes/*.ts` (przywrócone z `main`) | Oryginalne legacy shape | `@unisource/sdk` → `UnisourceClient` |
| V2 beta | `/v2/upload`, `/v2/folders`, `/v2/my-files`, `/v2/files`, `/v2/admin`, `/v2/admin/files`, `/v2/main`, `/v2/releases`, `/v2/app`, `/v2/public`, `/v2/shares`, `/v2/share-links`, `/v2/superadmin` | `apps/backend/src/routes/v2/*.ts` (wyekstrahowane z obecnego `routes/v1/*.ts`) | V2 envelope: `{ item }`, `{ items, page }`, `{ processed, failed }` | `@unisource/sdk/v2` → `UnisourceV2Client` |

## Kluczowe decyzje

1. **Źródło logiki V2**: Skopiować z obecnych `routes/v1/*.ts` na `feat/v2-split`, cross-reference z `beta` originals gdzie niejasne
2. **Header `X-Unisource-API-Version: 2`**: Usunąć całkowicie z SDK V2 transportu — prefiks `/v2/*` wystarczająco rozróżnia kontrakt
3. **Czyszczenie `routes/v1/`**: Usunąć katalog natychmiast po zweryfikowaniu działania
4. **Merge files/folders V2**: Najpierw przejrzeć istniejące testy V2, potem diff-merge brakujących CRUD handlerów bez dotykania bulk/list/cursor
5. **V2 error wrapper**: Ograniczyć tylko do `/v2/*`, nie globalnie
6. **Auth V2**: Public routes (`/v2/public`) bez auth, superadmin (`/v2/superadmin`) z CF Access middleware, pozostałe ze standardowym `authMiddleware`

## Mapowanie route'ów

| Legacy route z `main` | Legacy mount | Źródło V2 (`routes/v1/`) | Docelowy V2 mount | Docelowy V2 plik |
|---|---:|---|---|---|
| `routes/upload.ts` | `/upload` | `routes/v1/upload.ts` | `/v2/upload` | `routes/v2/upload.ts` |
| `routes/files.ts` | `/admin/files` | `routes/v1/files.ts` | `/v2/admin/files` | `routes/v2/adminFiles.ts` |
| `routes/folders.ts` | `/folders` | `routes/v1/folders.ts` + `routes/v2/folders.ts` | `/v2/folders` | `routes/v2/folders.ts` (merge) |
| `routes/fileRecords.ts` | `/my-files` | `routes/v1/fileRecords.ts` | `/v2/my-files` | `routes/v2/myFiles.ts` |
| `routes/userFiles.ts` | `/files` | `routes/v1/userFiles.ts` + `routes/v2/files.ts` | `/v2/files` | `routes/v2/files.ts` (merge) |
| `routes/admin.ts` | `/admin` | `routes/v1/admin.ts` | `/v2/admin` | `routes/v2/admin.ts` |
| `routes/app.ts` | `/app` | `routes/v1/app.ts` | `/v2/app` | `routes/v2/app.ts` |
| `routes/mainStorage.ts` | `/main` | `routes/v1/mainStorage.ts` | `/v2/main` | `routes/v2/mainStorage.ts` |
| `routes/public.ts` | `/public` | `routes/v1/public.ts` | `/v2/public` | `routes/v2/public.ts` |
| `routes/releases.ts` | `/releases` | `routes/v1/releases.ts` | `/v2/releases` | `routes/v2/releases.ts` |
| `routes/shareLinks.ts` | `/my-files/:fileId/share-links`, `/share-links/:linkId` | `routes/v1/shareLinks.ts` | `/v2/my-files/:fileId/share-links`, `/v2/share-links/:linkId` | `routes/v2/shareLinks.ts` |
| `routes/shares.ts` | `/shares` | `routes/v1/shares.ts` | `/v2/shares` | `routes/v2/shares.ts` |
| `routes/superadmin.ts` | `/superadmin` | `routes/v1/superadmin.ts` | `/v2/superadmin` | `routes/v2/superadmin.ts` |

## Transformacja kształtu odpowiedzi w V2

W nowych plikach V2 wszystkie referencje do negocjacji legacy muszą być zastąpione:

| Obecne (w `routes/v1/`) | Docelowe (w `routes/v2/`) |
|---|---|
| `itemOrLegacy(c, value, legacy)` | `{ item: value }` |
| `listOrLegacy(c, values, page, legacyExtra)` | `{ items: values, page }` |
| `unpaginatedListOrLegacy(c, values, legacy)` | `{ items: values, page: { limit: values.length, next_cursor: null } }` |
| `actionOrLegacy(c, action, legacy)` | `{ item: action }` (chyba że konkretny endpoint definiuje inaczej) |
| Bulk endpoints (`files`/`folders`) | Zostawić `{ processed, failed }` |

## Struktura `apps/backend/src/index.ts`

```
Legacy mounty (ścieżki bez prefiksu, middleware z main):
  /upload → authMiddleware, rateLimit
  /admin/files → authMiddleware, rateLimit, requireAdminMiddleware
  /folders → authMiddleware, rateLimit
  /my-files → authMiddleware, rateLimit
  /files → authMiddleware, rateLimit
  /shares → authMiddleware, rateLimit
  /admin → requireAdminMiddleware
  /main → requireAdminMiddleware
  /releases → requireAdminMiddleware
  /app → API key / auth
  /public → bez auth
  /superadmin → CF Access middleware wewnątrz routera
  /share-links → authMiddleware

V2 mounty:
  app.use('/v2/*', v2RequestIdGuard)
  /v2/error wrapper tylko dla /v2/*
  /v2/public → bez auth
  /v2/superadmin → CF Access middleware wewnątrz routera
  /v2/* → authMiddleware (protected)
```

## SDK V2 zmiany

Wszystkie resource'y w `packages/unisource-sdk/src/v2/resources/*.ts` zaktualizować ścieżki:

| Resource | Przed | Po |
|---|---|---|
| upload.ts | `/upload/...` | `/v2/upload/...` |
| releases.ts | `/releases/...` | `/v2/releases/...` |
| admin.ts | `/admin/...` | `/v2/admin/...` |
| admin-files.ts | `/admin/files/...` | `/v2/admin/files/...` |
| main-storage.ts | `/main/...` | `/v2/main/...` |
| app.ts | `/app/releases/latest` | `/v2/app/releases/latest` |
| public.ts | `/public/:slug` | `/v2/public/:slug` |
| shares.ts | `/shares/...` | `/v2/shares/...` |
| share-links.ts | `/my-files/:id/share-links`, `/share-links/:id` | `/v2/my-files/:id/share-links`, `/v2/share-links/:id` |
| my-files.ts | `/my-files/...` | `/v2/my-files/...` |
| user-files.ts | `/files/:id...` | `/v2/files/:id...` |
| folders.ts | mieszane `/v2/folders` i `/folders` | `/v2/folders` |
| files.ts | `/v2/files` | `/v2/files` (bez zmian) |

Usunąć `X-Unisource-API-Version: 2` z `transport.ts` i z testów, które go oczekują.

## Kryteria akceptacji

1. `apps/backend/src/index.ts` nie importuje `apps/backend/src/routes/v1/*`
2. Legacy route'y zachowują kontrakt z `main`
3. V2 route'y pod `/v2/*` dostępne dla wszystkich resource'ów
4. `routes/v2/files.ts` i `routes/v2/folders.ts` nadal obsługują bulk, breadcrumbs, HMAC cursor
5. V2 route'y nie używają `itemOrLegacy`, `listOrLegacy`, `unpaginatedListOrLegacy`, `actionOrLegacy`
6. SDK `@unisource/sdk/v2` nie wykonuje requestów na legacy pathy
7. SDK `@unisource/sdk` legacy pozostaje bez zmian
8. Public V2 endpointy nie wymagają standardowego auth
9. Superadmin V2 używa tylko CF Access, nie zwykłego user/API-key auth
10. `pnpm --filter @unisource/sdk test` i `pnpm --filter backend check` przechodzą

## Non-goals

- Nie przepisywać V2 od zera
- Nie zmieniać ręcznie wersji w `package.json`
- Nie publikować SDK
- Nie usuwać istniejącej funkcjonalności V2 `files`/`folders`: bulk, breadcrumbs, cursor validation, API-key preview
- Nie zmieniać kontraktu frontendu poza tym, co wynika ze ścieżek SDK V2
