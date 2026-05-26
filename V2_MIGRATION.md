# V2 Migration Status

> Stan na **2026-05-26**. Wszystko na branchu `beta`. Praca w toku.

Refaktor UniSource do "standardu V2" obejmuje trzy warstwy: backend, SDK i frontend. Każda jest na innym etapie. Ten dokument trzyma jedno spójne źródło prawdy o tym, co jest zrobione, a co nie.

## TL;DR

| Warstwa | Postęp | Co dalej |
|---|---|---|
| **Backend (Hono routes → V2 standard)** | ~59% (60/101 handlerów) | Zmigrować `upload.ts`, `releases.ts`, `superadmin.ts` |
| **SDK — `UnisourceClient` (legacy)** | ~100% pokrycie API legacy | Tylko maintenance — nowych metod się nie dodaje |
| **SDK — `UnisourceV2Client` (nowy)** | ~38% pokrycie endpointów V2 (27 metod / 7 zasobów) | Dobudowywać metody w miarę stabilizacji V2 |
| **Frontend (`apps/frontend/src/lib/api.ts`)** | 0% adopcji `UnisourceV2Client` | Migracja po dobudowaniu kluczowych metod V2 SDK |

---

## Co to jest "standard V2"?

V2 to ujednolicony kontrakt na całe API:

1. **Error envelope**: `{ error: { code, message, request_id, details? } }` z helperem `V2Error` w `apps/backend/src/lib/v2/errors.ts`. Wszystkie kody są w zamkniętym zestawie:
   - `validation_error` · `cursor_invalid` · `search_too_long` · `unauthorized` · `forbidden` · `not_found` · `rate_limited` · `internal_error` · `conflict` · `bad_gateway` · `gone`
2. **Success envelope**: `{ data, meta }` (lub `{ items, page: { limit, next_cursor } }` dla list).
3. **Cursor-based pagination** zamiast offset/limit.
4. **Helpers**: `v2ValidationHook` (Zod), `logV2Request`, `v2RequestIdGuard`, `v2ErrorHandler` (middleware).
5. **`X-Request-Id`** w każdym response (do tracingu).
6. **Schemas**: V2 shape `is_trashed: boolean` zamiast legacy `1/0`.

---

## 1. Backend — `apps/backend/src/routes/`

### Zmigrowane do V2 (60 handlerów, 13 plików)

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
| `userFiles.ts` | 5 | `/files/:id` (Plan 2) |
| `v2/files.ts` | 1 | Nowy V2 namespace |
| `v2/files.legacy.ts` | 3 | Działa V2 mimo nazwy — do scalenia z `v2/files.ts` |
| `v2/folders.ts` | 5 | |

### Pozostałe legacy (41 handlerów, 3 pliki)

| Plik | Handlery | Linii | Główna złożoność |
|---|---:|---:|---|
| `superadmin.ts` | 18 | 313 | Dynamic SQL, brak V2 helperów; chroniony przez CF Access — **internal**, nie powinien trafić do SDK |
| `upload.ts` | 9 | 827 | Złożony flow uploadu (init → upload → complete), własny `validationErrorHook` |
| `releases.ts` | 14 | 596 | Złożony flow releasów, własny `validationErrorHook` |

### Znane drobiazgi (niekrytyczne)
- `logV2Request` przed 302 redirect w `public.ts` loguje status 200 zamiast 302 (`c.res.status` nie jest aktualizowane przez `new Response(null, { status: 302 })`).
- `cursor_invalid` w `folders.ts` nie podaje 3. argumentu (message); pozostałe pliki podają `'cursor is invalid'`.
- `upload_id` w download-url response `fileRecords.ts` używa `record.id` zamiast `record.upload_id` — pre-existing bug.

### `index.ts` — równoległe podpięcia legacy/V2?
**Nie ma dual-mountu** "stara wersja + V2 pod /v2". Wszystkie pliki zostały zmigrowane "in-place" do V2-shape pod oryginalnymi prefixami. Sub-app `/v2` istnieje tylko dla nowych zasobów (`v2/files.ts`, `v2/files.legacy.ts`, `v2/folders.ts`) z dedykowanym `v2ErrorHandler`. Reszta polega na global `app.onError` w `index.ts`, który obsługuje `V2Error`.

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
| `client.v2.*` | files (list, bulkMove/Trash/Restore), folders (list, breadcrumbs, bulkMove/Trash/Restore) | 🚫 **`@deprecated FROZEN`** — używać `UnisourceV2Client` |

### `UnisourceV2Client` (nowy) — `src/v2/client.ts`

**Pokrycie: częściowe.** Świeżo po refactorze (`transport.ts` + `resources/`), klasa skurczona do 47 linii. Cała logika fetch/auth/error w `transport.ts` (95 linii). 7 zasobów per plik w `resources/`:

| Resource | Metody | Endpointy | Stan |
|---|---|---|---|
| `app` | `latestRelease` | `GET /app/releases/latest` | ✅ |
| `files` | `list`, `bulkTrash`, `bulkRestore`, `bulkMove` | `/v2/files*` | ✅ pełne pokrycie V2 |
| `folders` | `list`, `breadcrumbs`, `bulkTrash`, `bulkRestore`, `bulkMove` | `/v2/folders*` | ✅ pełne pokrycie V2 |
| `userFiles` | `get`, `update`, `delete`, `restore`, `downloadUrl` | `/files/:id*` (Plan 2) | ✅ pełne |
| `mainStorage` | `list`, `get`, `update`, `delete`, `restore` | `/main*` | ✅ pełne |
| `shareLinks` | `create`, `listForFile`, `update`, `delete` | `/my-files/:id/share-links`, `/share-links/:id` | ✅ pełne |
| `shares` | `list`, `create`, `get`, `delete` | `/shares*` | ✅ pełne |

**Czego brakuje w `UnisourceV2Client`** (endpointy, które są w API i już mają V2 shape, ale nie są jeszcze opakowane):

- `upload.*` — cały flow uploadu (10 endpointów). **HIGH dla integratorów**, ale backend jest jeszcze legacy → priorytet zależy od kolejności migracji backendu.
- Folder CRUD: `POST /folders`, `GET/PATCH/DELETE /folders/:id`, `POST /folders/:id/restore` — backend już V2.
- `myFiles` listy: `GET /my-files`, `GET /my-files/trash`, `PATCH /my-files/:id/move` — backend już V2.
- `releases.*` — 14 endpointów, backend wciąż legacy.
- `admin.*` — 10 endpointów dla server-to-server, backend już V2.
- `public.*` — 3 endpointy do anonymous resolution.

**Werdykt**: `UnisourceV2Client` jest gotowym, dobrze zaprojektowanym fundamentem, ale jeszcze niegotowy do publikacji jako standalone integration SDK — nie zastępuje `UnisourceClient`. Oba są publikowane razem; integratorzy używają `UnisourceClient`, my migrujemy ich stopniowo na `UnisourceV2Client` w miarę dobudowywania metod.

---

## 3. Frontend — `apps/frontend/src/lib/api.ts`

**Stan: 0% adopcji `UnisourceV2Client`.** Frontend nadal używa `UnisourceClient` (legacy). Migracja zaplanowana osobnym PR-em po dobudowaniu kluczowych metod w SDK V2.

---

## 4. Niespójności / dług techniczny

### `UnisourceV2Client` — niespójności do uporządkowania
1. **Brak wsparcia API-key path**. `transport.ts` ustawia tylko `Authorization: Bearer ${getToken()}`. Server-to-server integratorzy z API key dostaną 401. `UnisourceClient` ma ten sam problem — to dług całego SDK, nie tylko V2.
2. **Bulk response envelope mismatch**. `bulkOperationResponseSchema` zwraca flat `{ success, processed_count, failed_ids }`, ale V2 list używa `{ data, meta }` lub `{ items, page }`. Backend tak wystawia, więc SDK jest spójne z backendem — niespójność jest **w samym standardzie V2**, nie w SDK. Do decyzji: ujednolicić envelope albo udokumentować jako wyjątek.
3. **Brak typowanego enum `V2ErrorCode`** w `UnisourceV2Error.code` — luźny string. Backend ma zamknięty zestaw — łatwa poprawka.
4. **Brak typowanego helpera paginacji** (cursor pass-through działa, ale brak iteratora) — minor DX.
5. **Wartość `null` w query** jest serializowana do stringa `"null"` (`transport.ts:62`) — zgodne z konwencją V2 backendu (`folder_id=null`), ale niezaudokumentowane w typach.

### Backend — drobiazgi do sprzątnięcia po migracji
- Plik `v2/files.legacy.ts` do scalenia z `v2/files.ts`.
- 3 pliki z własnym `validationErrorHook` (`releases.ts`, `upload.ts`) → przejście na `v2ValidationHook` przy migracji.
- Usunąć namespace `client.v2.*` z `UnisourceClient` po pełnej migracji frontendu na `UnisourceV2Client` (release breaking change).

---

## 5. Pozostała praca — kolejność wykonania

1. **`upload.ts` backend → V2** (9 handlerów). Krytyczne dla integratorów; bez tego nie ma sensu dodawać `upload` do `UnisourceV2Client`.
2. **`UnisourceV2Client.upload.*`** (po kroku 1). Pełny flow + multipart.
3. **`UnisourceV2Client.folders.*` CRUD** + **`UnisourceV2Client.myFiles.*`** listy/move (backend jest gotowy).
4. **`UnisourceV2Client` — wsparcie API-key path** w `transport.ts`. Mała zmiana, duży zysk dla server-to-server.
5. **`releases.ts` backend → V2** (14 handlerów) + odpowiedniki w `UnisourceV2Client`.
6. **`UnisourceV2Client.admin.*`** (backend już V2, 10 endpointów).
7. **`superadmin.ts` backend → V2** (18 handlerów). Internal, nie wymaga SDK.
8. **Frontend `api.ts`** — migracja na `UnisourceV2Client`. Dopiero po krokach 2-3.
9. **Cleanup**: usunąć `client.v2.*` namespace z `UnisourceClient` (breaking, major bump).
10. **Cleanup**: zmienić nazwę `v2/files.legacy.ts` → scalić z `v2/files.ts`.

---

## Definicja "skończonej migracji V2"

- [ ] Wszystkie route'y backendu używają V2Error / V2 helpers — **brak własnych `validationErrorHook`**.
- [ ] `UnisourceV2Client` pokrywa wszystkie publiczne endpointy (poza `superadmin/*` i czysto wewnętrznymi).
- [ ] Frontend `api.ts` używa wyłącznie `UnisourceV2Client`.
- [ ] `UnisourceClient` (legacy) wycofany lub mocno odchudzony — namespace `v2.*` usunięty.
- [ ] Spójny error envelope + spójny success envelope (rozwiązany problem bulk).
- [ ] API-key auth path obsługiwany w transport SDK.
- [ ] Wszystkie kody błędów typowane przez enum `V2ErrorCode` w SDK.
