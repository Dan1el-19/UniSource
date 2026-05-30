# V2 Split Handoff

## Cel dokumentu

To jest plan dla agenta implementacyjnego. Nie zawiera implementacji kodu. Celem jest bezpieczne rozdzielenie obecnego stanu `beta`, gdzie V2 zostało wprowadzone in-place w routach legacy, na dwa równoległe kontrakty:

| Rodzina | Publiczne ścieżki | Kontrakt | Kod docelowy |
|---|---|---|---|
| V1 legacy | `/upload`, `/folders`, `/my-files`, `/files`, `/admin`, `/admin/files`, `/main`, `/releases`, `/app`, `/public`, `/shares`, `/share-links`, `/superadmin` | Dotychczasowe odpowiedzi legacy, kompatybilne z `UnisourceClient` | `apps/backend/src/routes/*.ts`, przywrócone z `main` |
| V2 beta | `/v2/upload`, `/v2/folders`, `/v2/my-files`, `/v2/files`, `/v2/admin`, `/v2/admin/files`, `/v2/main`, `/v2/releases`, `/v2/app`, `/v2/public`, `/v2/shares`, `/v2/share-links`, `/v2/superadmin` | V2 envelope: `{ item }`, `{ items, page }`, `{ processed, failed }`, V2 error envelope | `apps/backend/src/routes/v2/*.ts`, wyciągnięte z obecnego `beta` |

SDK po rozdzieleniu:

| Export | Klient | Ścieżki HTTP |
|---|---|---|
| `@unisource/sdk` | Legacy `UnisourceClient` | Bez zmian, bez wymuszania V2 |
| `@unisource/sdk/v2` | `UnisourceV2Client` | Tylko `/v2/*` |

## Problem do rozwiązania

Na `beta` większość route'ów legacy została zmigrowana do V2 w katalogu `apps/backend/src/routes/v1/`. Część plików zwraca dual response przez `itemOrLegacy()`, `listOrLegacy()`, `actionOrLegacy()`, a część zawsze zwraca V2. To oznacza, że merge `beta` do `main` może złamać produkcyjne legacy klienty.

Najważniejsze źródła problemu:

| Lokalizacja | Aktualny stan na `beta` | Ryzyko |
|---|---|---|
| `apps/backend/src/routes/v1/*.ts` | Hybrydowe lub V2-only handlery pod legacy ścieżkami | Legacy pathy mogą zwracać V2 shape |
| `apps/backend/src/index.ts` | Importuje `routes/v1/*` jako główne legacy route'y | Legacy mounty nie są już legacy |
| `apps/backend/src/routes/v2/index.ts` | Montuje tylko `files` i `folders` | Brakuje większości V2 zasobów |
| `packages/unisource-sdk/src/v2/resources/*.ts` | Część resource'ów woła legacy ścieżki z headerem opt-in V2 | SDK V2 zależy od hybrydowej negocjacji zamiast od `/v2/*` |
| `apps/backend/src/index.ts` V2 middleware | `v2RequestIdGuard` i V2 error wrapper działają globalnie przez `wantsV2()` | Po splitcie powinny dotyczyć tylko V2, bez zmiany legacy response |

## Decyzje architektoniczne

1. Użyć strategii copy-and-split: obecne `routes/v1/*.ts` z `beta` są źródłem logiki V2, ale docelowo V2 ma mieszkać w `routes/v2/*.ts`.
2. Legacy route'y przywrócić z `main` do `apps/backend/src/routes/*.ts` i montować je tak, jak przed migracją V2.
3. Nie utrzymywać hybrydowego kontraktu na legacy pathach. Po splitcie legacy path nie powinien zależeć od `X-Unisource-API-Version: 2`.
4. SDK V2 ma wołać `/v2/*`; header `X-Unisource-API-Version: 2` może pozostać jako nieszkodliwy sygnał beta, ale nie może być wymagany do otrzymania V2 odpowiedzi. Zalecenie: usunąć go z V2 transportu po przejściu na dedykowane ścieżki, jeśli testy i CORS to potwierdzą.
5. `routes/v2/files.ts` i `routes/v2/folders.ts` są kanoniczne dla nowych listingów, bulk, breadcrumbs i HMAC cursorów. Nie nadpisywać ich kopią z `routes/v1/*`; trzeba domerge'ować brakujące CRUD handlery.
6. `/v2/public` i `/v2/superadmin` wymagają osobnych zasad auth. Nie mogą bezrefleksyjnie dziedziczyć globalnego `authMiddleware` z `/v2/*`.

## Non-goals

- Nie przepisywać V2 od zera według `api-v2-architecture.md`.
- Nie zmieniać ręcznie wersji w `package.json`.
- Nie publikować SDK.
- Nie usuwać istniejącej funkcjonalności V2 `files`/`folders`: bulk, breadcrumbs, cursor validation, API-key preview.
- Nie zmieniać kontraktu frontendu poza tym, co wynika ze ścieżek SDK V2.

## Pliki i katalogi wejściowe

| Obszar | Pliki |
|---|---|
| Backend entrypoint | `apps/backend/src/index.ts` |
| Obecne źródło logiki V2 | `apps/backend/src/routes/v1/*.ts` |
| Docelowe route'y legacy | `apps/backend/src/routes/*.ts`, z referencji `main` |
| Docelowe route'y V2 | `apps/backend/src/routes/v2/*.ts` |
| V2 helpers | `apps/backend/src/lib/v2/*`, `apps/backend/src/middleware/v2Errors.ts`, `apps/backend/src/middleware/v2RequestIdGuard.ts` |
| SDK V2 transport | `packages/unisource-sdk/src/v2/transport.ts` |
| SDK V2 resources | `packages/unisource-sdk/src/v2/resources/*.ts` |
| SDK V2 client/export | `packages/unisource-sdk/src/v2/client.ts`, `packages/unisource-sdk/src/v2/index.ts`, `packages/unisource-sdk/package.json` |
| Architektura referencyjna | `api-v2-architecture.md` |

## Mapowanie backend route'ów

Implementacja powinna utrzymać poniższe mapowanie. Nazwy plików V2 mogą być camelCase lub kebab-case, ale mounty HTTP muszą być dokładnie takie jak w tabeli.

| Legacy route z `main` | Legacy mount | Źródło V2 na `beta` | Docelowy V2 mount | Docelowy V2 plik |
|---|---:|---|---:|---|
| `routes/upload.ts` | `/upload` | `routes/v1/upload.ts` | `/v2/upload` | `routes/v2/upload.ts` |
| `routes/files.ts` | `/admin/files` | `routes/v1/files.ts` | `/v2/admin/files` | `routes/v2/adminFiles.ts` |
| `routes/folders.ts` | `/folders` | `routes/v1/folders.ts` plus obecne `routes/v2/folders.ts` | `/v2/folders` | `routes/v2/folders.ts` |
| `routes/fileRecords.ts` | `/my-files` | `routes/v1/fileRecords.ts` | `/v2/my-files` | `routes/v2/myFiles.ts` |
| `routes/userFiles.ts` | `/files` | `routes/v1/userFiles.ts` plus obecne `routes/v2/files.ts` | `/v2/files` | `routes/v2/files.ts` |
| `routes/admin.ts` | `/admin` | `routes/v1/admin.ts` | `/v2/admin` | `routes/v2/admin.ts` |
| `routes/app.ts` | `/app` | `routes/v1/app.ts` | `/v2/app` | `routes/v2/app.ts` |
| `routes/mainStorage.ts` | `/main` | `routes/v1/mainStorage.ts` | `/v2/main` | `routes/v2/mainStorage.ts` |
| `routes/public.ts` | `/public` | `routes/v1/public.ts` | `/v2/public` | `routes/v2/public.ts` |
| `routes/releases.ts` | `/releases` | `routes/v1/releases.ts` | `/v2/releases` | `routes/v2/releases.ts` |
| `routes/shareLinks.ts` | `/my-files/:fileId/share-links`, `/share-links/:linkId` | `routes/v1/shareLinks.ts` | `/v2/my-files/:fileId/share-links`, `/v2/share-links/:linkId` | `routes/v2/shareLinks.ts` |
| `routes/shares.ts` | `/shares` | `routes/v1/shares.ts` | `/v2/shares` | `routes/v2/shares.ts` |
| `routes/superadmin.ts` | `/superadmin` | `routes/v1/superadmin.ts` | `/v2/superadmin` | `routes/v2/superadmin.ts` |

## Kolejność implementacji

### 0. Przygotowanie i ochrona źródeł

1. Sprawdzić `git status`, aktualny branch i diff, żeby nie nadpisać cudzych zmian.
2. Przed przywracaniem legacy route'ów z `main` zachować obecną logikę V2 z `apps/backend/src/routes/v1/*.ts`, bo to jest źródło dla nowych `routes/v2/*.ts`.
3. Porównać referencję legacy z `main` przez `git show main:apps/backend/src/routes/<file>.ts` dla każdego z 13 route'ów.
4. Nie robić `git reset --hard`, `git checkout --` ani masowego revertu.

### 1. Utworzyć komplet route'ów V2

1. Dla 11 brakujących zasobów skopiować logikę V2 z obecnych `routes/v1/*.ts` do nowych plików `routes/v2/*.ts` zgodnie z mapowaniem.
2. Dla `files` i `folders` nie nadpisywać istniejących plików. Dodać do nich brakujące handlery z `routes/v1/userFiles.ts` i `routes/v1/folders.ts`.
3. Usunąć z V2 route'ów zależność od negocjacji legacy response:
   - `itemOrLegacy(c, value, legacy)` zastąpić stałym V2 `{ item: value }` albo helperem `item(value)`.
   - `listOrLegacy(c, values, page, legacyExtra)` zastąpić stałym `{ items: values, page }` albo helperem `list(values, page)`.
   - `unpaginatedListOrLegacy(c, values, legacy)` zastąpić `{ items: values, page: { limit: values.length, next_cursor: null } }`.
   - `actionOrLegacy(c, action, legacy)` zastąpić `{ item: action }`, chyba że istniejący kontrakt konkretnego endpointu V2 definiuje inaczej.
   - Bulk endpoints `files`/`folders` pozostawić jako `{ processed, failed }`.
4. Zostawić V2 walidację i observability tam, gdzie już istnieją:
   - `V2Error` i `errorResponse`.
   - `v2ValidationHook`.
   - `logV2Request` / V2 request logging, jeśli dany plik go używa.
   - HMAC cursor i fingerprint query w `files`/`folders`.
5. Zaktualizować importy względne po przeniesieniu z `routes/v1` do `routes/v2`.
6. Upewnić się, że V2 route'y nie importują `wantsV2()` tylko po to, żeby zdecydować o response shape.

### 2. Przywrócić legacy route'y z `main`

1. Przywrócić 13 legacy plików z `main` do `apps/backend/src/routes/*.ts`:
   - `upload.ts`
   - `folders.ts`
   - `files.ts`
   - `fileRecords.ts`
   - `userFiles.ts`
   - `admin.ts`
   - `app.ts`
   - `mainStorage.ts`
   - `public.ts`
   - `releases.ts`
   - `shareLinks.ts`
   - `shares.ts`
   - `superadmin.ts`
2. Po przywróceniu legacy route'y nie powinny importować `../../lib/v2/responses`, `../../lib/v2/negotiation` ani V2 schema-only helperów, chyba że taki import istniał już na `main`.
3. Katalog `routes/v1/` po splitcie nie powinien być importowany przez `index.ts`. Można go usunąć dopiero po potwierdzeniu, że nie jest potrzebny do testów ani jako źródło migracji.

### 3. Przebudować `apps/backend/src/index.ts`

1. Importy legacy mają wskazywać na `./routes/<file>`, nie `./routes/v1/<file>`.
2. Legacy mounty mają zachować dotychczasowe middleware i kolejność z `main`:
   - `/upload`: `authMiddleware`, `rateLimit('general')`.
   - `/admin/files`: `authMiddleware`, `rateLimit('general')`, `requireAdminMiddleware`.
   - `/folders`, `/my-files`, `/files`, `/shares`: `authMiddleware`, `rateLimit('general')`, `adminPreviewMiddleware` tam, gdzie był używany.
   - `/admin`, `/main`, `/releases`: `requireAdminMiddleware` tam, gdzie wymagane.
   - `/app`: API key / auth zgodnie z legacy.
   - `/public`: bez auth.
   - `/superadmin`: CF Access middleware wewnątrz routera, jak w legacy.
3. V2 mounty powinny być oddzielone od legacy. Najbezpieczniejszy wariant:
   - `app.use('/v2/*', v2RequestIdGuard)`.
   - V2 error transformation tylko dla `/v2/*`, a nie globalnie dla wszystkich route'ów.
   - Auth middleware dla V2 zastosować selektywnie: protected V2 route'y przez `authMiddleware`, public V2 route'y bez `authMiddleware`, superadmin V2 przez CF Access.
4. Jeśli zostaje globalny `app.onError`, warunek `wantsV2(c)` powinien być prawdziwy dla `/v2/*`, ale legacy path z headerem `X-Unisource-API-Version: 2` nie powinien zmieniać kontraktu odpowiedzi legacy.
5. CORS `allowHeaders` może zostawić `X-Unisource-API-Version`, jeśli SDK nadal go wysyła. Jeśli header zostanie usunięty z SDK, nie trzeba usuwać go z CORS.

### 4. Zaktualizować `routes/v2/index.ts`

Docelowo `routes/v2/index.ts` ma montować komplet V2 sub-routerów. Proponowana struktura mountów:

```ts
v2.route('/upload', uploadV2)
v2.route('/folders', foldersV2)
v2.route('/my-files', myFilesV2)
v2.route('/files', filesV2)
v2.route('/admin/files', adminFilesV2)
v2.route('/admin', adminV2)
v2.route('/main', mainStorageV2)
v2.route('/releases', releasesV2)
v2.route('/app', appV2)
v2.route('/public', publicV2)
v2.route('/shares', sharesV2)
v2.route('/', shareLinksV2)
v2.route('/superadmin', superadminV2)
```

Uwaga dla `shareLinksV2`: jeżeli router obsługuje dwa prefiksy (`/my-files/:fileId/share-links` i `/share-links/:linkId`), najprościej zamontować go pod `/` wewnątrz `/v2` albo rozdzielić na dwa routery.

### 5. Poprawić SDK V2 pathy

W `packages/unisource-sdk/src/v2/resources/*.ts` wszystkie requesty V2 mają wskazywać na `/v2/*`.

| SDK resource | Obecne legacy pathy | Docelowe pathy |
|---|---|---|
| `upload.ts` | `/upload/...` | `/v2/upload/...` |
| `releases.ts` | `/releases/...` | `/v2/releases/...` |
| `admin.ts` | `/admin/...` | `/v2/admin/...` |
| `admin-files.ts` | `/admin/files/...` | `/v2/admin/files/...` |
| `main-storage.ts` | `/main/...` | `/v2/main/...` |
| `app.ts` | `/app/releases/latest` | `/v2/app/releases/latest` |
| `public.ts` | `/public/:slug` | `/v2/public/:slug` |
| `shares.ts` | `/shares/...` | `/v2/shares/...` |
| `share-links.ts` | `/my-files/:id/share-links`, `/share-links/:id` | `/v2/my-files/:id/share-links`, `/v2/share-links/:id` |
| `my-files.ts` | `/my-files/...` | `/v2/my-files/...` |
| `user-files.ts` | `/files/:id...` | `/v2/files/:id...` |
| `folders.ts` | mieszane `/v2/folders` i `/folders` | wszystko `/v2/folders` |
| `files.ts` | już `/v2/files` | zostawić `/v2/files` |

Dodatkowo:

1. Zweryfikować `packages/unisource-sdk/src/v2/transport.ts`.
2. Jeśli usuwany jest `X-Unisource-API-Version: 2`, zaktualizować testy oczekujące tego headera.
3. Nie ruszać `exports` w `packages/unisource-sdk/package.json`, chyba że build pokaże problem z `@unisource/sdk/v2`.
4. Nie zmieniać ręcznie `version` SDK.

### 6. Testy do dostosowania i dodania

Minimalny zestaw testów po implementacji:

| Obszar | Co sprawdzić |
|---|---|
| Legacy compatibility | `/folders`, `/my-files`, `/upload`, `/releases`, `/admin`, `/public` zwracają legacy shape bez `{ item }`/`{ items, page }`, nawet jeśli klient wyśle `X-Unisource-API-Version: 2` |
| V2 route smoke | Każdy mount `/v2/<resource>` odpowiada V2 envelope lub V2 error envelope |
| V2 files/folders | Istniejące testy `apps/backend/test/routes/v2/files*.test.ts`, `folders*.test.ts`, integration tests, DB tests dalej przechodzą |
| V2 upload/releases | `v2-upload-end-to-end.test.ts`, `v2-releases-end-to-end.test.ts` przechodzą po zmianie SDK pathów |
| Public V2 | `/v2/public/:slug` i `/v2/public/:slug/unlock` działają bez Authorization, ale z wymaganym `X-Service-ID`, jeżeli legacy tego wymaga |
| Superadmin V2 | `/v2/superadmin/*` używa CF Access protection, nie zwykłego API-key/JWT auth |
| SDK V2 path test | `UnisourceV2Client` wykonuje requesty wyłącznie na `/v2/*` |
| Error contract | Błędy V2 mają `{ error: { code, message, request_id? } }`; legacy błędy zachowują legacy shape |
| Auth hardening | API-key permissions i `X-Target-User-ID` nadal działają dla `/v2/files` oraz nie rozszczelniają legacy |

Istniejące testy warte uruchomienia po implementacji:

```bash
pnpm --filter @unisource/sdk typecheck
pnpm --filter @unisource/sdk test
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter backend check
```

Jeżeli pełne testy backendu są zbyt wolne w iteracji, najpierw uruchomić celowane testy V2 i legacy routes, a na końcu `pnpm --filter backend check`.

## Kryteria akceptacji

Implementację można uznać za gotową, gdy spełnione są wszystkie punkty:

1. `apps/backend/src/index.ts` nie importuje `apps/backend/src/routes/v1/*`.
2. Legacy route'y pod `/upload`, `/folders`, `/my-files`, `/files`, `/admin`, `/admin/files`, `/main`, `/releases`, `/app`, `/public`, `/shares`, `/share-links`, `/superadmin` zachowują kontrakt z `main`.
3. V2 route'y pod `/v2/*` są dostępne dla wszystkich resource'ów z tabeli mapowania.
4. `routes/v2/files.ts` i `routes/v2/folders.ts` nadal obsługują istniejące V2 funkcje: list, bulk, breadcrumbs, HMAC cursor.
5. V2 route'y nie zwracają legacy shape i nie używają `itemOrLegacy`, `listOrLegacy`, `unpaginatedListOrLegacy`, `actionOrLegacy` do wyboru shape.
6. SDK `@unisource/sdk/v2` nie wykonuje requestów na legacy pathy.
7. SDK `@unisource/sdk` pozostaje legacy i nie wymaga zmian w aplikacjach.
8. Publiczne V2 endpointy nie wymagają standardowego auth, jeśli ich legacy odpowiedniki są publiczne.
9. Superadmin V2 nie jest przypadkowo dostępny przez zwykły user/API-key auth.
10. `pnpm --filter @unisource/sdk test` i `pnpm --filter backend check` przechodzą albo znane wyjątki są opisane z konkretnym powodem.

## Największe ryzyka

| Ryzyko | Dlaczego ważne | Mitigacja |
|---|---|---|
| Utrata źródła V2 podczas restore z `main` | Obecne `routes/v1/*.ts` są źródłem V2 logiki | Najpierw utworzyć V2 kopie albo zachować diff/snapshot |
| `upload.ts` | Najwięcej logiki: R2, Appwrite, multipart, quota, error mapping | Przenieść osobno, odpalić targeted upload tests przed resztą |
| `releases.ts` | Multipart release lifecycle i wiele handlerów | Przenieść osobno, odpalić integration test SDK ↔ backend |
| `files` vs `admin/files` naming | `routes/v2/files.ts` oznacza user files, a legacy `routes/files.ts` oznacza admin upload records | Użyć osobnego `routes/v2/adminFiles.ts` |
| `folders` merge | Istniejący V2 plik ma funkcje, których nie ma legacy CRUD | Merge, nie overwrite |
| Global V2 error wrapper | Może nadal zmieniać legacy odpowiedzi przy V2 headerze | Ograniczyć wrapper do `/v2/*` |
| `/v2/public` auth | Global `/v2/* authMiddleware` zablokuje publiczne linki | Public mount przed protected auth albo osobne middleware per route |
| `/v2/superadmin` auth | Może dostać niewłaściwy model autoryzacji | Trzymać CF Access middleware w routerze, bez zwykłego authMiddleware |
| SDK parsery | Po zmianie pathów backend może zwrócić inny shape niż parser oczekuje | Testy SDK path + integration tests |
| Dual maintenance | Bugfixy będą potrzebne w legacy i V2 | Po splitcie dokumentować, który bug dotyczy którego kontraktu |

## Sugerowany podział pracy dla agenta implementacyjnego

1. Backend split foundation: zabezpieczyć obecne `routes/v1`, utworzyć brakujące `routes/v2`, przywrócić legacy `routes/*.ts`, przebudować `index.ts`.
2. V2 files/folders merge: domerge'ować brakujące CRUD do istniejących V2 files/folders bez naruszania bulk/list/cursor.
3. V2 heavy routes: przenieść i przetestować `upload.ts`, `releases.ts`, `adminFiles.ts`, `admin.ts`.
4. V2 remaining routes: przenieść `myFiles`, `mainStorage`, `app`, `public`, `shares`, `shareLinks`, `superadmin`.
5. SDK V2 path migration: prefiks `/v2` we wszystkich resources, ewentualnie usunąć V2 opt-in header.
6. Test pass: typecheck SDK, test SDK, backend targeted tests, backend full check.
7. Cleanup: usunąć nieużywane `routes/v1` tylko jeśli nie ma importów; zostawić changesety bez ręcznego version bumpu.

## Commands referencyjne

Komendy do weryfikacji, nie do bezrefleksyjnego kopiowania:

```bash
git status
git diff -- apps/backend/src packages/unisource-sdk/src
git show main:apps/backend/src/routes/upload.ts
pnpm --filter @unisource/sdk typecheck
pnpm --filter @unisource/sdk test
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter backend check
```

## Uwagi release'owe

- Zmiany w `packages/unisource-sdk` wymagają changesetu dla SDK, chyba że repo/CI ma osobną decyzję dla branchy beta.
- Dla beta release nie używać ręcznego bumpa wersji SDK w `package.json`.
- Backend deploy na `main` nie może zależeć od prerelease SDK, zgodnie z zasadami w `AGENTS.md`.
