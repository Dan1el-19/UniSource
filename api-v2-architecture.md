# UniSource API v2 - plan architektoniczny

## 1. Cel API v2

API v2 ma być docelowym, stabilnym kontraktem UniSource dla operacji na plikach i folderach. V1 pozostaje warstwa kompatybilnosci, ale nowe ekrany, SDK i optymalizacje powinny rozwijac sie przeciwko v2.

Glowne cele:

- prostszy kontrakt niz v1, bez historycznych wyjatkow i duplikacji endpointow;
- spojne modele odpowiedzi, bledow, paginacji i operacji bulk;
- mniejsza liczba requestow potrzebnych frontendowi do zbudowania widoku storage;
- pelne wykorzystanie srodowiska Cloudflare Workers: bindings, D1, R2, rate limits, streaming i praca poza sciezka odpowiedzi;
- stabilnosc produkcyjna pod limity Workers, D1 i R2.

V2 nie powinno kopiowac v1 endpoint po endpoincie. Powinno definiowac mniejszy, lepiej zaprojektowany kontrakt dla file managera: listing, search, sort, move, trash, restore, delete, bulk, breadcrumbs i download URL.

## 2. Zasady Workers-native

Cloudflare Workers nie jest klasycznym serwerem Node.js. API v2 ma byc projektowane pod krotkie, przewidywalne wykonanie, mala liczbe subrequestow i brak buforowania duzych danych w pamieci.

Zasady bazowe:

- **Bindings first**: D1, R2, Rate Limiting, Queues i ewentualne Service Bindings uzywac przez `env`, nie przez Cloudflare REST API. Bindings sa szybsze, maja mniej ograniczen i nie wymagaja sekretow w kodzie.
- **D1-first dla metadanych**: Worker waliduje i koordynuje, ale logika filtrowania, sortowania, breadcrumbs, subtree i bulk powinna byc wykonywana w SQL.
- **R2 direct/presigned dla plikow**: duze uploady i downloady nie powinny przechodzic przez Worker jako zbuforowane body.
- **Streaming zamiast buforowania**: nie uzywac `request.arrayBuffer()` ani `response.text()` dla nieograniczonych payloadow. JSON payloady musza miec maly, jasno ograniczony rozmiar.
- **`waitUntil` tylko dla prac niekrytycznych**: audit, metryki i lekkie side-effecty moga isc po odpowiedzi. Prace, ktore musza dojsc do skutku, powinny trafic do Queue.
- **Brak request-scoped global state**: zaden stan uzytkownika, service, auth ani wynikow query nie moze zyc w module-level mutable variables.
- **Kazda Promise kontrolowana**: Promise musi byc `await`, `return`, `void` z intencja albo przekazana do `c.executionCtx.waitUntil()`.

Zrodla Cloudflare:

- [Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Workers Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Workers Context / waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/)

## 3. Docelowy kontrakt API

Kontrakt pozostaje rozdzielony na zasoby:

- `/v2/files`
- `/v2/folders`

Nie przechodzimy na jeden wspolny `/v2/items`, bo rozdzielone zasoby pasuja do obecnego SDK, istniejacych tabel i uprawnien. Spojnosc ma wynikac ze wspolnych konwencji odpowiedzi, bledow, bulk i paginacji.

### Files

Docelowe operacje:

- `GET /v2/files` - globalny lub folder-scoped listing plikow;
- `GET /v2/files/:id` - szczegoly pliku;
- `PATCH /v2/files/:id` - rename i male metadane;
- `POST /v2/files/:id/move` - pojedynczy move;
- `POST /v2/files/:id/trash` - soft delete;
- `POST /v2/files/:id/restore` - restore;
- `DELETE /v2/files/:id` - permanent delete po ustalonej semantyce;
- `GET /v2/files/:id/download-url` - krotko zyjacy URL do pobrania;
- `POST /v2/files/bulk` - bulk move/trash/restore/delete.

### Folders

Docelowe operacje:

- `GET /v2/folders` - globalny lub parent-scoped listing folderow;
- `POST /v2/folders` - create;
- `GET /v2/folders/:id` - szczegoly folderu;
- `PATCH /v2/folders/:id` - rename, color tag i male metadane;
- `GET /v2/folders/:id/breadcrumbs` - sciezka root -> folder;
- `POST /v2/folders/:id/move` - pojedynczy move z cycle prevention;
- `POST /v2/folders/:id/trash` - soft delete subtree;
- `POST /v2/folders/:id/restore` - restore subtree wedlug jawnej semantyki;
- `DELETE /v2/folders/:id` - permanent delete subtree;
- `POST /v2/folders/bulk` - bulk move/trash/restore/delete.

### Query standard

Listingi powinny uzywac tych samych nazw tam, gdzie to mozliwe:

```ts
type V2ListQuery = {
  parent_id?: string | null;   // folders
  folder_id?: string | null;   // files
  search?: string;
  trash?: 'active' | 'trashed' | 'all';
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'size';
  sort_dir?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
};
```

`trash` powinno docelowo zastapic bool `is_trashed`, bo enum jasno opisuje intencje klienta i pozwala dodac `all` bez kolejnego parametru.

## 4. Standard odpowiedzi i bledow

V2 powinno miec stabilny wire shape uzywany konsekwentnie w backendzie i SDK.

### List response

```ts
type V2ListResponse<T> = {
  items: T[];
  page: {
    limit: number;
    next_cursor: string | null;
  };
};
```

### Single resource response

```ts
type V2ResourceResponse<T> = {
  item: T;
};
```

Jesli SDK chce utrzymac wygodniejsze aliasy (`file`, `folder`), moze je dodac na poziomie klienta, ale HTTP v2 powinno miec jeden standard.

### Bulk response

```ts
type V2BulkResponse = {
  processed: string[];
  failed: Array<{
    id: string;
    code: string;
    message: string;
  }>;
};
```

`processed_count` mozna wyliczyc z `processed.length`. Pelniejszy `failed[]` jest wazny produkcyjnie, bo frontend moze pokazac konkretny powod bledu dla kazdego elementu.

### Error response

```ts
type V2ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
  };
};
```

Kody bledow powinny byc maszynowe i stabilne, np. `folder_not_found`, `target_folder_trashed`, `cycle_detected`, `cursor_invalid`, `bulk_limit_exceeded`, `rate_limited`.

## 5. Semantyka folder tree

Folder w v2 jest wezlem drzewa, nie tylko rekordem. Kazda operacja musi miec jasna semantyke subtree.

Zasady:

- trash foldera obejmuje folder, wszystkie podfoldery i pliki w subtree albo jawnie oznacza folder jako trashed ancestor, ktorego dzieci nie sa widoczne w `trash='active'`;
- restore foldera przywraca subtree tylko wtedy, gdy docelowy parent jest aktywny;
- permanent delete foldera usuwa subtree z D1 i uruchamia czyszczenie fizycznych obiektow zgodnie ze strategia storage;
- move foldera musi blokowac przeniesienie do samego siebie i do wlasnego descendant;
- listing aktywnych plikow/folderow nie moze pokazywac elementow, ktorych ancestor jest w koszu;
- breadcrumbs dla folderu w koszu powinny dzialac, ale odpowiedz powinna zachowac `is_trashed`, aby UI moglo pokazac kontekst.

Dla D1 najlepszym mechanizmem sa recursive CTE:

- breadcrumbs: parent chain od folderu do root;
- subtree: folder i descendant folders;
- cycle detection: sprawdzenie, czy target parent znajduje sie w subtree przenoszonego folderu.

## 6. Strategia D1

D1 jest glownym zrodlem prawdy dla metadanych. Operacje D1 wykonuja sie w limitach Workers CPU/memory i pojedyncza baza D1 przetwarza zapytania sekwencyjnie, wiec kluczowe sa krotkie query i wlasciwe indeksy.

Zasady:

- wszystkie listy uzywaja cursor pagination, nie offset;
- cursor jest wazny tylko dla identycznego zestawu filtrow i sortowania;
- docelowo cursor powinien zawierac fingerprint query, aby backend mogl odrzucic uzycie z innymi filtrami;
- `limit` powinien miec twardy max zgodny z `FILES_MAX_LIMIT`;
- bulk payload powinien miec max 100 ID, bo D1 ma limit 100 bound parameters per query;
- dynamiczne sortowanie wolno budowac tylko z allowlisty kolumn, nigdy z surowej wartosci klienta;
- `LIKE` search musi respektowac limit D1 dla wzorca i powinien byc ograniczony dlugoscia inputu;
- kazde query listujace powinno miec indeks dopasowany do `service_id`, `user_id`, `trash`, parent/folder i sort;
- `db.batch()` stosowac do wielostatementowych operacji, ktore maja zyskac na redukcji round-tripow i transakcyjnosci;
- `db.exec()` zostawic dla migracji lub maintenance, nie dla request path.

Minimalny kierunek indeksow v2:

```sql
-- files active/trash listing by folder + created_at
CREATE INDEX IF NOT EXISTS idx_files_v2_folder_created
  ON files(service_id, user_id, folder_id, is_trashed, created_at DESC, id DESC);

-- files global active/trash listing + created_at
CREATE INDEX IF NOT EXISTS idx_files_v2_global_created
  ON files(service_id, user_id, is_trashed, created_at DESC, id DESC);

-- files sort by size
CREATE INDEX IF NOT EXISTS idx_files_v2_size
  ON files(service_id, user_id, is_trashed, size DESC, id DESC);

-- folders listing by parent + created_at
CREATE INDEX IF NOT EXISTS idx_folders_v2_parent_created
  ON folders(service_id, user_id, parent_id, is_trashed, created_at DESC, id DESC);

-- folders global listing + name
CREATE INDEX IF NOT EXISTS idx_folders_v2_name
  ON folders(service_id, user_id, is_trashed, name ASC, id ASC);
```

Zrodla Cloudflare:

- [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
- [D1 Worker Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## 7. Strategia R2

R2 przechowuje obiekty, D1 przechowuje metadane. API v2 nie powinno traktowac R2 jako bazy danych ani wykonywac listingow storage w request path dla widokow uzytkownika.

Zasady:

- object key musi byc immutable i kolizyjnie bezpieczny, oparty o UUID lub rownowazny identyfikator, nie o nazwe pliku uzytkownika;
- filename jest metadana w D1 i moze sie zmieniac bez zmiany object key;
- upload/download duzych plikow odbywa sie przez presigned URL lub bezposredni R2 binding, nie przez pelne buforowanie w Workerze;
- multipart upload pozostaje preferowana sciezka dla duzych plikow;
- backend finalizuje stan w D1 po potwierdzeniu storage;
- cleanup fizyczny ma byc idempotentny i odporny na retry;
- permanent delete powinien najpierw ustalic rekordy i uprawnienia w D1, a operacje fizyczne wykonywac tak, aby czesciowa awaria byla mozliwa do ponowienia.

Zrodlo Cloudflare:

- [R2 Workers API](https://developers.cloudflare.com/r2/get-started/workers-api/)

## 8. Observability i operacje produkcyjne

V2 powinno od poczatku emitowac dane, ktore pozwalaja diagnozowac wydajnosc i bledy bez zgadywania.

Wymagania:

- kazdy request v2 ma `request_id`, zwracany w bledach i logowany;
- logi sa JSON, z polami: `request_id`, `method`, `path`, `status`, `ms`, `service_id`, `user_id`, `auth_type`, `route_family`, `operation`;
- D1 helpery dla v2 powinny opcjonalnie logowac `meta.duration`, `rows_read`, `rows_written` dla wolnych query;
- staging powinien miec wlaczone traces/logs z wysokim samplingiem;
- produkcja powinna miec sampling dobrany do wolumenu ruchu;
- rate limit failures powinny miec osobny kod bledu `rate_limited`;
- bledy storage i D1 nie powinny ujawniac bucketow, storage keys ani wewnetrznych zapytan SQL klientowi.

`waitUntil` nadaje sie do lekkich metryk i audit logow po odpowiedzi. Jesli zdarzenie musi dojsc do skutku, np. cleanup lub reconciliation, powinno trafic do Cloudflare Queues, bo `waitUntil` ma ograniczony czas zycia po odpowiedzi.

## 9. Migration path z v1

V1 pozostaje kompatybilnym legacy API. V2 jest nowym kontraktem, ktory docelowo zastapi v1 w SDK i frontendzie.

Etapy:

1. **Architecture freeze**: uzgodnic standard odpowiedzi, bledow, trash, bulk i cursor.
2. **SDK contract**: zdefiniowac typy v2 w `@unisource/sdk` i testy kontraktowe.
3. **Backend v2 core**: wdrozyc list/get/move/trash/restore/download-url dla files i folders.
4. **Bulk v2**: ujednolicic bulk przez jeden endpoint operacyjny per zasob lub stabilne endpointy per action.
5. **Frontend opt-in**: nowe widoki uzywaja `client.v2`, stare sciezki zostaja na v1.
6. **Parity check**: porownac funkcje v1 i v2 oraz oznaczyc brakujace zachowania.
7. **Deprecation notice**: po stabilizacji v2 oznaczyc v1 jako legacy w docs i SDK.

Nie nalezy usuwac v1 ani zmieniac jego wire shape podczas rozwoju v2.

## 10. Test strategy

V2 wymaga testow na poziomach, ktore lapia roznice miedzy Node a Workers runtime.

Minimalny zestaw:

- testy schematow SDK: query, response, error, bulk;
- testy klienta SDK: URL, headers, `asUser`, serializacja query;
- testy route w `@cloudflare/vitest-pool-workers`, z realnym stylem D1/R2 bindings;
- testy D1 helperow: cursor pagination, invalid cursor, search limit, sort allowlist, isolation by `service_id` i `user_id`;
- testy folder tree: breadcrumbs, subtree trash, restore, move into descendant, move into trashed target;
- testy bulk: partial success, per-item failure, limit 100 ids, cross-user/cross-service IDs;
- testy R2 flows: presigned download URL, multipart create/sign/list/complete/abort, physical cleanup retry;
- testy bledow: stable `error.code`, brak wycieku `storage_key`, bucketow i raw SQL;
- smoke test stagingowy dla upload -> complete -> list v2 -> download-url -> trash -> restore.

Cloudflare rekomenduje testowanie Workerow w runtime przez `@cloudflare/vitest-pool-workers`, bo zwykle testy Node nie wykrywaja czesci problemow z bindings, runtime APIs i compatibility flags.

## 11. Kryteria gotowosci v2

V2 mozna uznac za gotowe do pierwszego produkcyjnego uzycia, gdy:

- wszystkie publiczne response shapes sa zapisane w SDK i testowane;
- wszystkie listy uzywaja cursor pagination;
- files i folders maja spojna semantyke trash/restore/delete;
- folder tree nie moze wejsc w cykl;
- bulk zwraca diagnostyczne bledy per element;
- D1 query maja indeksy zgodne z glownymi access patterns;
- duze pliki nie sa buforowane w Workerze;
- staging ma observability pozwalajace diagnozowac wolne query i bledy;
- v1 pozostaje kompatybilne i nie wymaga zmian w istniejacych konsumentach.