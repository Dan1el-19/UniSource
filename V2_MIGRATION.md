# V2 Migration Status

> Stan na **2026-05-31**. Split stable/V2 jest przygotowany na branchu `feat/v2-split`.

Refaktor UniSource do "standardu V2" obejmuje **dwie warstwy w zakresie**: backend (routes → V2 standard) i SDK (`UnisourceV2Client`). Frontend i integratorzy są **poza zakresem** — `UnisourceClient` (legacy) zostaje stable, bez zmian. Ten dokument trzyma jedno spójne źródło prawdy o tym, co jest zrobione, a co nie.

## TL;DR

| Warstwa | Postęp | Co dalej |
|---|---|---|
| **Backend (Hono routes → V2 standard)** | 100% (100/100 handlerów) | Merge `beta` → `main` dyskusja |
| **SDK — `UnisourceClient` (legacy)** | ~100% pokrycia API legacy, **stable, bez zmian** | Tylko maintenance — żadnych breakingów, żadnego deprecation |
| **SDK — `UnisourceV2Client` (nowy)** | ~91% pokrycia (71 metod / 13 zasobów) | Complete — wszystkie publiczne zasoby pokryte |

Frontend (`apps/frontend` — admin panel UniSource) oraz integratorzy zewnętrzni są **poza zakresem** tej refaktoryzacji. V2 powstaje jako równoległy, gotowy kontrakt; integracja po stronie konsumentów to osobna decyzja na przyszłość.

---

## Contract Status

Backend V2 is available exclusively under `/v2/*`. Stable paths preserve the legacy response shapes from `main`; `X-Unisource-API-Version` and `Accept` headers do not change their behavior.

Stable routes:
- `/upload/*`
- `/admin/*`
- `/folders/*`
- `/my-files/*`
- `/files/*`
- `/main/*`
- `/releases/*`
- `/app/*`
- `/public/*`
- `/superadmin/*`
- `/shares/*`
- `/share-links/*`

Dedicated V2 routes use the same resource families below `/v2/*`, including `/v2/superadmin/*`. Legacy `UnisourceClient` remains compatible with stable routes. `UnisourceV2Client` calls `/v2/*` directly.

---

## Co to jest "standard V2"?

V2 to ujednolicony kontrakt na całe API:

1. **Error envelope**: `{ error: { code, message, request_id, details? } }` z helperem `V2Error` w `apps/backend/src/lib/v2/errors.ts`. Wszystkie kody są w zamkniętym zestawie:
   - `validation_error` · `cursor_invalid` · `search_too_long` · `unauthorized` · `forbidden` · `not_found` · `rate_limited` · `internal_error` · `conflict` · `bad_gateway` · `gone` · `file_too_large` · `quota_exceeded`
2. **Success envelope**: `{ data, meta }` (lub `{ items, page: { limit, next_cursor } }` dla list).
3. **Cursor-based pagination** zamiast offset/limit (z wyjątkiem `admin.listUsers` — known limitation Appwrite SDK).
4. **Helpers**: `v2ValidationHook` (Zod), `logV2Request`, `v2RequestIdGuard`, `v2ErrorHandler` (middleware).
5. **`X-Request-Id`** w każdym response (do tracingu).
6. **Schemas**: V2 shape `is_trashed: boolean` zamiast legacy `1/0`.
7. **Bulk envelope V2**: `{ processed: string[], failed: [{id, code, message}] }` (per-id failure reasons; replaces flat `{success, processed_count, failed_ids}`).

---

## 1. Backend — `apps/backend/src/routes/`

### Zmigrowane do V2 (100 handlerów, 15 plików)

| Plik | Handlery | Uwaga |
|---:|---|
| `admin.ts` | 11 | Cursor pagination, V2Error, v2ValidationHook |
| `app.ts` | 1 | `/app/releases/latest` |
| `fileRecords.ts` | 8 | `/my-files`, R2/Appwrite, najwięcej error pathów |
| `files.ts` | 4 | `/admin/files` |
| `folders.ts` | 6 | D1-only, recursive CTE, batch delete |
| `mainStorage.ts` | 5 | Cursor pagination |
| `public.ts` | 3 | 302 redirect, signed tokens, `gone` error code |
| `releases.ts` | 14 | Single + multipart R2 release lifecycle, CRUD, list/latest, sync z per-item failure |
| `shareLinks.ts` | 4 | |
| `shares.ts` | 4 | Plan 2 contract |
| `superadmin.ts` | 18 | Cursor pagination, V2 envelopes, V2Error, v2ValidationHook, logV2Request; internal, no SDK |
| `upload.ts` | 8 | Single + multipart R2 + Appwrite; `file_too_large`, `quota_exceeded`; `/upload/fail` restored with V2 envelopes and cross-service isolation |
| `userFiles.ts` | 5 | `/files/:id` (Plan 2) |
| `v2/files.ts` | 2 | Nowy V2 namespace; `POST /v2/files/bulk` z action union |
| `v2/folders.ts` | 3 | `POST /v2/folders/bulk` z action union + cycle prevention |

### Pozostałe legacy

**Brak** — wszystkie route'y backendu zostały zmigrowane do standardu V2.

### Znane drobiazgi (niekrytyczne)
- `logV2Request` przed 302 redirect w `public.ts` loguje status 200 zamiast 302 (`c.res.status` nie jest aktualizowane przez `new Response(null, { status: 302 })`).
- `cursor_invalid` w `folders.ts` nie podaje 3. argumentu (message); pozostałe pliki podają `'cursor is invalid'`.
- `upload_id` w download-url response `fileRecords.ts` używa `record.id` zamiast `record.upload_id` — pre-existing bug.

### `index.ts` — równoległe podpięcia legacy/V2?
**Nie ma dual-mountu** "stara wersja + V2 pod /v2". Wszystkie pliki zostały zmigrowane "in-place" do V2-shape pod oryginalnymi prefixami. Sub-app `/v2` istnieje tylko dla nowych zasobów (`v2/files.ts`, `v2/folders.ts`) z dedykowanym `v2ErrorHandler`. Reszta polega na global `app.onError` w `index.ts`, który obsługuje `V2Error`.

---

## 2. SDK — `packages/unisource-sdk/`

### Dwa współistniejące klienty

```
@unisource/sdk           → UnisourceClient (legacy, full coverage, stable)
@unisource/sdk/v2        → UnisourceV2Client (nowy, częściowy, modern transport)
```

### `UnisourceClient` (legacy) — `src/client.ts`

**Pokrycie: ~100% endpointów legacy API.** Stable, używany przez frontend i integracje produkcyjne. Resources:

| Namespace | Endpointy | Stan |
|---|---|---|
| `upload.*` (+ `multipart.*`) | `/upload/r2/init`, `/upload/appwrite/init`, `/upload/complete`, `/upload/fail`, multipart create/sign-part/list-parts/complete/abort | ✅ pełne |
| `myFiles.*` | list/trash/get/downloadUrl/move/delete/restore/update | ✅ pełne |
| `folders.*` | list/get/create/update/delete/restore | ✅ pełne |
| `mainStorage.*` (+ `upload.*`) | list/get/rename/delete/restore + 4 upload helpers | ✅ pełne |
| `releases.*` (+ `upload.multipart.*`) | upload init/complete/fail + multipart + list/get/latest/update/delete/sync | ✅ pełne |
| `admin.*` | service/usage/audit/users/files (15 metod) | ✅ pełne |
| `shareLinks.*` | create/list/update/delete | ✅ pełne |
| `files.*` (Plan 2 `/files/:id`) | get/update/delete/restore/downloadUrl | ✅ pełne |
| `shares.*` (Plan 2 `/shares`) | list/create/get/delete | ✅ pełne |
| `app.releases.latest` | `/app/releases/latest` | ✅ pełne |
| `getPublicFileInfo`, `unlockPublicFile` | `/public/:slug` + `/unlock` | ✅ pełne (top-level fns) |
| `client.v2.*` | files (list, bulkMove/Trash/Restore), folders (list, breadcrumbs, bulkMove/Trash/Restore) | 🚫 **`@deprecated FROZEN`** — używać `UnisourceV2Client`; zostaje w SDK (legacy stable) |

### `UnisourceV2Client` (nowy) — `src/v2/client.ts`

**Pokrycie: częściowe (~91%, 71 metod / 13 zasobów).** Po sekcji 3: rozszerzone resources, ujednolicony bulk envelope, `apiKey` auth path, typowany `V2ErrorCode`. 13 zasobów per plik w `resources/`:

| Resource | Metody | Endpointy | Stan |
|---|---|---|---|
| `app` | `latestRelease` | `GET /app/releases/latest` | ✅ |
| `files` | `list`, `bulk`, `bulkTrash`, `bulkRestore`, `bulkMove` | `/v2/files*` | ✅ pełne pokrycie V2 |
| `folders` | `list`, `breadcrumbs`, `bulk`, `bulk*`, `create`, `get`, `update`, `delete`, `restore` | `/v2/folders` + `/folders` | ✅ pełne pokrycie V2 + CRUD |
| `myFiles` | `list`, `listTrash`, `move` | `/my-files*` | ✅ pełne (listy + move) |
| `admin` | 11 metod (service/usage/audit/users/role/storage/quota) | `/admin/*` | ✅ pełne (offset pagination dla listUsers — known limitation) |
| `public` | `getShareLink`, `unlockShareLink`, `buildDownloadUrl` | `/public/*` | ✅ pełne (anonymous, auth: 'none') |
| `releases` | `uploadInit`, `uploadComplete`, `uploadFail`, `multipartCreate/ SignPart/ListParts/Complete/Abort`, `list`, `latest`, `get`, `update`, `delete`, `sync` | `/releases*` | ✅ pełne pokrycie V2 |
| `userFiles` | `get`, `update`, `delete`, `restore`, `downloadUrl` | `/files/:id*` (Plan 2) | ✅ pełne |
| `mainStorage` | `list`, `get`, `update`, `delete`, `restore` | `/main*` | ✅ pełne |
| `shareLinks` | `create`, `listForFile`, `update`, `delete` | `/my-files/:id/share-links`, `/share-links/:id` | ✅ pełne |
| `shares` | `list`, `create`, `get`, `delete` | `/shares*` | ✅ pełne |

**Czego brakuje w `UnisourceV2Client`** (na sekcję 4):

- `upload.*` — cały flow uploadu (10 endpointów). Sekcja 2. ✅ ukończone
- Żadnych — wszystkie publiczne zasoby backendu mają pokrycie SDK V2.

**Werdykt**: po sekcji 1 `UnisourceV2Client` pokrywa wszystkie publiczne zasoby V2 backendu, które już są zmigrowane. Zostają sekcje 2 (upload) i 3 (releases) — oba czekają na migrację backendu. Oba klienty są publikowane razem i pozostają tak długo, aż V2 osiągnie stabilność i kompletność. **Ta refaktoryzacja nie obejmuje migracji żadnych konsumentów na V2 klient** — produkcyjnie V2 nie jest nigdzie wykorzystywane do czasu stabilizacji.

---

## 3. Frontend i integratorzy — poza zakresem

Frontend (`apps/frontend`, admin panel API) oraz wszelcy konsumenci `UnisourceClient` **nie są ruszani** w tej refaktoryzacji:

- `apps/frontend` pozostaje na `UnisourceClient` (legacy). Brak migracji.
- `UnisourceClient` (legacy) jest stable na branchu `main`, ma realnych konsumentów produkcyjnych — żadnych breakingów, żadnego deprecation timeline.
- Branch `beta` (gdzie żyje refaktor V2) **nie jest używany produkcyjnie**. V2 nie wraca do `main` ani nie jest integrowane u konsumentów dopóki nie osiągnie stabilności i kompletności.
- Decyzja o ewentualnej migracji jakichkolwiek konsumentów na `UnisourceV2Client` to osobna inicjatywa, **poza zakresem tego dokumentu**.

V2 jest budowane jako równoległy, kompletny kontrakt — gotowy, ale bez wymuszania migracji.

---

## 4. Niespójności / dług techniczny

### `UnisourceV2Client` — niespójności do uporządkowania
1. **Brak typowanego helpera paginacji** (cursor pass-through działa, ale brak iteratora) — minor DX.
2. **Wartość `null` w query** jest serializowana do stringa `"null"` (`transport.ts`) — zgodne z konwencją V2 backendu (`folder_id=null`), ale niezaudokumentowane w typach.
3. **Success envelope mismatch dla list**: V2 list endpointów zwraca `{ items, page: { limit, next_cursor } }`, ale `myFiles.list/listTrash` zwraca flat `{ items, next_cursor, limit }` (legacy backend shape). Do ujednolicenia w sekcjach 2-3 albo udokumentowania jako wyjątek.

### Backend — drobiazgi do sprzątnięcia po migracji
- Pliki z własnym `validationErrorHook` (`releases.ts`, `upload.ts`) → przejście na `v2ValidationHook` przy migracji.

---

## 4.1 Known Limitations (po sekcji 1)

- **`apiKey` now works for `/v2/files` and `/v2/folders`** with `X-Target-User-ID` header. API keys require `files:read` for list/read operations and `files:delete` for destructive bulk operations.
- **`client.admin.listUsers` używa offset pagination**, nie cursor. Backend zależy od Appwrite SDK, który ma offset/limit. Niespójne z resztą V2 (audit-log używa cursor). Do rozwiązania jak/jeśli kiedyś zmieni się backend Appwrite.
- **Liczba endpointów admin: 10 vs 11.** `V2_MIGRATION_PLAN.md` §1 mówił "admin (10 endpointów)", realny backend ma 11 handlerów (`patch /service/settings` doszedł później).
- **Bulk delete dla files** (`POST /v2/files/bulk` z `action: 'delete'`) wykonuje tylko D1 cleanup. Fizyczny R2/Appwrite cleanup jest deferred do R2 lifecycle / Cloudflare Queues (zgodnie z `api-v2-architecture.md` §7). Single `DELETE /my-files/:id?permanent=true` w `fileRecords.ts` nadal robi storage cleanup.
- **Folder bulk move cycle prevention** wykonuje `getDescendantFolderIds` per-id w pętli — dla 100 IDs to 100 recursive CTE. Optymalizacja (jeden globalny CTE) możliwa w przyszłości.
- **`bulkRestoreFolders` parent-status check N+1.** `apps/backend/src/db/folders.ts:344-352` — sekwencyjne `.first(...)` per id w pętli. Dla 100 IDs to 100 osobnych zapytań po probe. Batch przez `WHERE parent_id IN (...)` możliwy, ale poza scope sekcji 1.
- **Folder bulk delete in route uses raw SQL.** `apps/backend/src/routes/v2/folders.ts` — handler dla `action: 'delete'` woła `db.batch(stmts)` bezpośrednio, zamiast `deleteFolderPermanently` z `db/folders.ts`. Inconsistent z resztą route'u, do refaktora (helper `bulkDeleteFolderSubtreesPermanently`) razem z R2/Appwrite cleanup w sekcji 2-3.
- **No SDK→backend bulk integration test** (analogiczny do `apps/backend/test/integration/v2-files-end-to-end.test.ts` ale dla `/bulk`). Mocki SDK + mocki backend pokrywają każdą stronę osobno; cross-tier wire shape drift złapie się na kolejnym deploymencie albo w sekcji 2-3.
- **BREAKING in V2 beta:** bulk response shape zmieniony z `{ success, processed_count, failed_ids? }` na `{ processed, failed[] }`. V2 beta nie ma produkcyjnych konsumentów — zmiana udokumentowana w changeset.
- **Legacy `UnisourceClient.v2.bulk*` broken against `beta` backend.** `packages/unisource-sdk/src/client.ts` `client.v2.files.bulkTrash/Restore/Move` i `client.v2.folders.bulkTrash/Restore/Move` nadal POSTują na `/v2/<resource>/bulk-{trash,restore,move}` — endpointy usunięte w Task 10/12. Spec mówi "frozen, no changes" w `legacy-draft.ts`, więc paths zostają jak są. Konsekwencja: `UnisourceClient.v2.*` działa TYLKO przeciwko backendowi z `main` (ma jeszcze stare endpointy), NIE przeciwko `beta`. Brak konsumentów produkcyjnych — V2 namespace w `UnisourceClient` nigdy nie był używany. Po merge'u sekcji 1 → main: konsumenci `client.v2.*` zostaliby zerwani, ale takich nie ma. Decyzja: zostawić jak jest, usunąć `client.v2.*` całkowicie przy domknięciu V2 (po sekcjach 2-4).
- **Folders CRUD URL pattern**: `client.folders.create/get/update/delete/restore` używają `/folders/...` (NIE `/v2/folders/...`) — pasuje do legacy backend mountu w `apps/backend/src/index.ts:65`. Istniejące `client.folders.list/breadcrumbs/bulk*` używają `/v2/folders/...`. Niespójność pathów wynikająca z hybrydowego stanu backendu.

---

## 5. Pozostała praca — kolejność wykonania

1. **Cleanup**: spójność bulk delete vs storage cleanup (R2/Appwrite), folder bulk move performance (jeden globalny CTE).

**Poza zakresem**: migracja frontendu/integratorów na `UnisourceV2Client`, jakiekolwiek zmiany w `UnisourceClient` (legacy) wykraczające poza maintenance, merge `beta` → `main` przed osiągnięciem stabilności i kompletności V2.

### Changeset policy

Pending SDK changesets are retained for eventual stable release from `main`; beta prerelease publishing uses `.github/workflows/sdk-beta-release.yml` and does not consume changesets.

---

## Definicja "skończonej refaktoryzacji V2"

Zakres: backend + SDK na branchu `beta`. **Konsumenci (frontend, integratorzy) nie są w zakresie** — `UnisourceClient` (legacy) na `main` zostaje stable. Dopiero po spełnieniu wszystkich poniższych punktów V2 jest kandydatem do produkcyjnego wykorzystania:

- [x] Wszystkie route'y backendu używają V2Error / V2 helpers — **brak własnych `validationErrorHook`**. ← sekcja 4
- [x] `UnisourceV2Client` pokrywa wszystkie publiczne endpointy (poza `superadmin/*` i czysto wewnętrznymi). ← sekcje 2-3
- [x] Spójny error envelope + spójny success envelope (rozwiązany problem bulk). ← `listOrLegacy`/`itemOrLegacy` adapters on all shared routes
- [x] API-key auth path obsługiwany w transport SDK. ← Task 3 sekcji 1
- [x] Wszystkie kody błędów typowane przez enum `V2ErrorCode` w SDK. ← Task 1 sekcji 1
- [x] `v2/files.legacy.ts` scalony z `v2/files.ts`. ← Task 10 sekcji 1

---

## Uwagi specyficzne dla `superadmin.ts`

- `is_trashed: boolean` nie ma zastosowania dla `superadmin.ts`, ponieważ ten route nie operuje na zasobach plików/folderów i nie zwraca stanu kosza.
- `superadmin.ts` jest wewnętrzny i nie jest wystawiony w SDK (`UnisourceV2Client` ani `UnisourceClient`).
