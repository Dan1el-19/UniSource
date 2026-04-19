# E2E Instrukcja dla Agenta: Integracja SDK, Backend i Svelte MVP

## Kontekst i Cel
Celem tego zadania jest ożywienie obecnego monorepo poprzez wprowadzenie ustandaryzowanej komunikacji i testowego, ale kompletnego, frontendu. Monorepo (prowadzone przy użyciu `pnpm`) składa się z:
- `apps/backend`: Aplikacja Hono oparta o Cloudflare Workers.
- `apps/frontend`: Czysty szablon Astro skonfigurowany pod `Svelte`.
- `packages/usrc-sdk`: Szablon `tsdown` do wytworzenia publicznej paczki NPM.

Twoim zadaniem jest stworzenie uniwersalnych kontraktów danych komunikacyjnych (schema validation) i zbudowanie frontendu udowadniającego, że cała architektura działa stabilnie i w sposób typowany E2E.

---

## 🛑 Sztywne Reguły Projektowe (CRITICAL)
Zanim podejmiesz jakiekolwiek kroki programistyczne, musisz zaadaptować poniższe zasady do każdego tworzonego pliku:

1. **Język pisany:** Wszystkie komentarze dokumentacyjne, pliki `.md`, oraz natywna treść po stronie interfejsu (UI) muszą być w **języku polskim**. Same komentarze i nazewnictwo zmiennych wewnątrz kodu (ang. inline code comments, git commits) muszą być w **języku angielskim**. 
2. **Svelte 5 (Runes & Snippets):** Bezwzględnie używaj najnowszej składni Svelte 5.
   - Zarządzanie stanem i reaktywnością musi opierać się na "runach": używaj `$state` (zamiast `let`), `$derived` (zamiast `$:`), `$effect` dla efektów ubocznych, oraz `$props()` dla właściwości komponentu.
   - Nowa obsługa zdarzeń DOM: używaj atrybutów bez prefiksu `on:` (np. `onclick={handler}` zamiast `on:click={handler}`).
   - Sloty są przestarzałe – korzystaj ze snippetów (`{#snippet nazwa()}` i `{@render nazwa()}`).
   - **Stan globalny:** Zamiast przestarzałego `$app/stores` używaj wyeksportowanych obiektów opartych na `$state` w dedykowanych plikach `.svelte.ts` lub systemowego `$app/state` przewidzianego do tego celu.
3. **Package Manager:** Wykorzystuj wyłącznie **pnpm**. Repozytorium jest monorepo zarządzanym przez `pnpm-workspace.yaml`. Nie używaj komend `npm`.
4. **Appwrite SDK (Nowy TablesDB i Składnia Obiektowa):** Terminologia "Databases" (Kolekcje, Dokumenty) ewoluowała w stronę modelu relacyjnego, wprowadzając nową powłokę **TablesDB** (Tabele, Wiersze). 
   - Konfiguruj dostęp przez instancję `new sdk.TablesDB(client)` zamiast starych wariantów z `Databases`.
   - Żądania wykonuj za pomocą struktury w pełni obiektowej ("object parameter style"). Przykład: zamiast przestarzałego wywołania `databases.createDocument('[db]', '[col]', ...)`, zawsze stosuj poprawną składnię, np. `tablesDB.createRow({ databaseId: '[db_id]', tableId: '[table_id]', rowId: 'unique()', data: data })`. 
   - Korzystaj z metod API właściwych dla tego paradygmatu (`listRows`, `updateRow`, itp.) zapewniając sobie rygorystyczne typowanie pod Tabele.
5. **Nowoczesny Design i UI (Tailwind CSS):** Interfejs ma być prosty, przejrzysty i ultra-nowoczesny. Nie zgadzamy się na przestarzały, typowy dla AI toporny wygląd używający "czystego CSS" lub prostych inline'owych hacków.
   - **Obowiązkowo użyj Tailwind CSS** do stylowania aplikacji.
   - Wprowadź jedną, solidną bibliotekę komponentów UI zintegrowaną ze środowiskiem (np. implementacje bazujące na *shadcn-svelte* lub bezgłowym *Melt UI*).
   - Oprzyj się o precyzyjnie zaprojektowany system spacingu, typografii i spójne palety barw wspierane przez narzędzia nowoczesnego ekosystemu zamiast pisania od zera. 

---

## 🔥 Faza 1: Wdrożenie SDK (Zod + TypeScript w `packages/usrc-sdk`)
Paczka ta musi być zaprojektowana jako uniwersalne API do integracji w różnych środowiskach (Astro, Hono, React Native Expo).

1. Zainstaluj `zod` (`pnpm add zod --filter usrc-sdk` lub manualnie dodaj pnpm z workspace).
2. Zdefiniuj obiekty schematów (`z.object`) odpowiadające domenom występującym z backendzie. Przeanalizuj endpointy `/upload` i `/files`, które są wstrzyknięte w pliku `apps/backend/src/index.ts`.
3. Wyodrębnij typy TS ze schematów korzystając z inferencji (np. `export type UploadRequest = z.infer<typeof uploadSchema>;`).
4. Skonfiguruj `index.ts` jako publiczny punkt wejściowy udostępniający wyłącznie schematy i przypisane im typy.
5. Upewnij się, że po wywołaniu `pnpm run build` za pomocą `tsdown`, paczka kompiluje się do poprawnego ESM (`dist/index.mjs`) razem z plikami `.d.ts`.

---

## 🔥 Faza 2: Połączenie z Backendem (`apps/backend`)
Przekształć API pod pełne typowanie opierając się na schematach.

1. W pliku `apps/backend/package.json` zasymuluj włączenie pakietu `usrc-sdk` z wewnątrz workspace.
2. Zamiast manualnie sprawdzać payload wysyłany na endpointy `/upload` oraz `/files`, zainstaluj pakiet `@hono/zod-validator` w backendzie.
3. Przepisz logikę walidacji odpowiednich route'ów.
4. Zwracane obiekty z backedu (JSON) typuj ręcznie lub na podstawie wcześniej przygotowanych, udostępnionych typów z paczki SDK.

---

## 🔥 Faza 3: Stworzenie MVP Frontendu (`apps/frontend`)
Zbuduj narzędzie wizualne (Wyspy Svelte), testujące łączność zachowując przy tym standard "premium".

1. **Konfiguracja UI:** Wykonaj instalację Tailwind CSS do projektu Astro (`pnpm astro add tailwind` lub przez plik konfiguracyjny). Dodaj wsparcie dla gotowej biblioteki UI opartej na Tailwind dla płynnego interfejsu (np. components wg. wzoru shadcn).
2. **Svelte Islands:** Frontend Astro korzystać ma z nowoczesnych komponentów Svelte oznaczonych dyrektywą `client:load`.
3. **Komunikacja:** Zaimportuj typy i schematy Zod bezpośrednio z twojej nowej, wewnętrznej paczki `usrc-sdk`. 
4. W nowych komponentach przetestuj komunikację ze stworzonym na backendzie endpointami wprowadzając otypowany `fetch()`. Formularz wysyłający dane ma bezpiecznie walidować pola za pomocą metody `schema.safeParse()` prosto z paczki SDK.
5. **Estetyka MVP:** Aplikacja ma wyglądać profesjonalnie na pierwszy rzut oka – unikaj potocznych standardów (tzw. AI-boilerplate design), wdrażaj przemyślane stany wczytywania, komunikaty błędów z wykorzystaniem toast notification, a całą interakcję obuduj z użyciem utility-classes z Tailwinda.

---

## 🔥 Faza 4: Weryfikacja Całościowa

### 4.1 Kompilacja
- Uruchom `pnpm -r typecheck` — żaden pakiet nie może mieć błędów TS
- Uruchom `pnpm -r build` — wszystkie trzy pakiety muszą się zbudować bez błędów
- Sprawdź że `packages/usrc-sdk/dist/` zawiera `index.mjs` i pliki `.d.ts`

### 4.2 Testy E2E flow uploadu

**Przypadek 1 — happy path R2:**
Wybierz plik w UI, wyślij — sprawdź że:
- request do `/upload/r2/init` zwrócił 201 z `presigned_url`
- PUT na presigned URL zwrócił 200
- UI pokazuje potwierdzenie sukcesu

**Przypadek 2 — happy path Appwrite:**
Analogicznie dla `/upload/appwrite/init` — sprawdź że
- response zawiera `file_id` i `appwrite_bucket_id`
- upload przez Appwrite SDK się powiódł

**Przypadek 3 — brak auth:**
Wywołaj `/upload/r2/init` bez Bearer tokena — sprawdź że UI obsługuje 401 i pokazuje czytelny komunikat błędu (toast), nie crashuje

**Przypadek 4 — walidacja frontendu:**
Spróbuj wysłać formularz z brakującym plikiem lub pustym polem — sprawdź że `safeParse()` z SDK zwraca błąd zanim cokolwiek trafi do backendu

**Przypadek 5 — błąd 400 z backendu:**
Zmodyfikuj tymczasowo request żeby wysłać payload bez `mime_type` — sprawdź że UI obsługuje 400 z czytelnym komunikatem

### 4.3 Raport końcowy
Przygotuj plik `WALKTHROUGH.md` w root monorepo zawierający:
- listę zainstalowanych bibliotek z uzasadnieniem wyboru
- opis struktury plików które zostały utworzone lub zmodyfikowane
- wynik każdego z 5 przypadków testowych z punktu 4.2
- wszelkie napotkane problemy i jak zostały rozwiązane