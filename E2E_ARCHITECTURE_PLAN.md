# E2E Architecture & Implementation Plan: UniSource Cloud

Poniższy plan stanowi kompletną, ostateczną architekturę rozwiązania stworzoną w oparciu o wytyczne z  `PLAN.md`, przemyślenia z `SECURITY.md` oraz konieczność udostępnienia spójnego i bezpiecznego API zarówno dla frontendu (Astro+Svelte), jak i przyszłej aplikacji pobocznej (React Native / Expo).

---

## 1. Architektura Autoryzacyjna (Hono Dual-Auth bez Proxy)

Rozwiązujemy dylemat przedstawiony w `SECURITY.md`. Używanie instancji Node (Astro SSR) tylko po to by "chować" `SERVICE_API_KEY` na frontendzie pozbawia nas elastyczności – zwłaszcza, że w React Native (apka kliencka) również nie możemy użyć sekretu z Cloudflare.

**Rozwiązanie: Delegowana Weryfikacja JWT (Appwrite-First)**
Zamiast "Astro Proxy", cały system (Front Svelte, Front RN) będzie komunikował się **zupełnie bezpośrednio** z Hono API za pomocą tokenów z Appwrite, a Hono zabezpieczy te połączenia natywnie z wykorzystaniem wariantu dwóch wejść (Edge to Edge Security).

1. **Klient (Svelte Island / Expo):** Użytkownik loguje się przez Appwrite SDK Klienta. Pomyślne zalogowanie daje sesję. Wołając `account.createJWT()` otrzymujemy tymczasowy token dostępowy.
2. **Wywołanie API:** Frontend Svelte/RN wysyła żądanie do Hono załączając nagłówek `X-Appwrite-JWT: <token>`. Nie ma potrzebnego żadnego dostępu do sekretów Cloudflare'a.
3. **Backend Middleware Hono (Ścieżka A):** Przyjmuje żądanie z nagłówkiem. Hono za pomocą `fetch` bardzo krótko potwierdza ten token pod adresem `APPWRITE_ENDPOINT/v1/account`. Jeżeli Appwrite zwróci `200 OK` i obiekt Usera – token jest poprawny. Środowisko wpuszcza żądanie modyfikując kontekst `c.set('user', user)`. Hono samo pobierze w locie `$id` usera.
4. **Backend Middleware Hono (Ścieżka B):** Na potrzeby ewentualnego ruchu od wewnątrz (Z Astro SSR / Cron jobs) dopuszczony będzie globalny, surowy `Authorization: Bearer <SERVICE_API_KEY>`, pod którym user to "System".
5. **Wyjątki publiczne:** Wymagane dla linków udostępniania (`PLAN.md`), np. route `app.get('/api/share/:linkId')` będzie całkowicie omijał to middleware.

---

## 2. Architektura Bazy Danych (Cloudflare D1 to Źródło Prawdy)

Zgodnie z wymaganiem, Appwrite obsługuje logowania (Auth), Storage z Appwrite jest jednym z driverów składowania, a Cloudflare D1 spaja to w pojedynczą relacyjną bazę danych "stanu i dysku klienta".

Projekt przyszłej migracji `0002_files_and_folders_tree.sql`:

### `folders` (Hierarchia i Organizacja)
Tabela rekurencyjna dla obsługi wejść typu "parent-child":
- `id` (VARCHAR UNIQUE PK)
- `user_id` (VARCHAR) - ID uźytkownika Appwrite
- `parent_id` (VARCHAR NULLABLE) - Identyfikator wyższego folderu (nawigacja typu "Moje > Projekty > 2025")
- `name` (VARCHAR) 
- `color_tag` (VARCHAR)
- `is_trashed` (BOOLEAN) - Obsługa "kosza" wg punktu `PLAN.md`
- `created_at`, `updated_at`

### `files` (Reprezentacja zwalidowanego pliku z R2 lub AW-Storage)
W trakcie "Initu", dane spływają do tymczasowego `uploads`. Gdy plik wejdzie w stan powierzenia serwerowi – trafia tu:
- `id` (PK)
- `user_id` (Właściciel Appwrite ID)
- `folder_id` (FK do tabeli root)
- `filename`, `size`, `mime_type`
- `storage_destination` ('r2' / 'appwrite')
- `storage_key`, `bucket`
- `is_trashed` (BOOLEAN - Kosz)
- `trashed_at` (INTEGER) - Data usunięcia (Systemowy Cron łatwo usunie starsze niż 30 dni z Cloudflare Workers).

---

## 3. Strategia SDK (`packages/unisource-sdk`)

Kluczem dla stabilnego React Native jest ujednolicenie SDK.
Gdybyśmy nie mieli paczki NPMowej – Expo musiałoby powielać walidator i schematy Zoda.

**Zasady rozbudowy SDK pod `PLAN.md`:**
1. Nowy plik `packages/unisource-sdk/src/folders.ts`: Eksponowanie `folderCreateRequestSchema`, `folderMoveRequestSchema`, `folderResponseSchema`.
2. Inferowane formaty przez `z.infer`.
3. Podpięcie typów zwrotnych z zapytania dla Hono. (Dzięki temu we frameworku React wystarczy `$state: FileRecord[]`).

---

## 4. Priorytetyzacja Działań dla Fazy 1 (Bieżący MVP)

Jeśli zaakceptujesz ten dokument, zaimplementuję te kroki bezwzględnie w kolejnym podejściu (jak kazałeś, teraz niczego nie modyfikowałem):

1. **Bezpieczeństwo**: Wpierw napiszę i zadbistuję pełne Hono Dual-Auth Middleware. Dopracuję zwracanie wyciągniętego z Appwrite `user.$id` w kontekście Cloudlfare'a.
2. **D1 Migracja**: Napiszę sztywny kod SQL ze zrzutowaniem powiązań do Kosza i Folderów dla D1.
3. **Typy w SDK**: Rozpiszemy brakujące definicje (Foldery).
4. **Endpointy Hono CRUD**: Endpointy dla Listowania Folderów, Przenoszenia plików oraz `DELETE` spychające logicznie dane do kosza (`is_trashed = true`).
5. **Udostępnianie**: Implementacja Route'a omieniającego Middleware (Generujący Presigned link tylko na żądanie – by zaocznie uniemożliwić botom darmowy transfer pobrań bez "ważnego okienka czasu" JWT lub Token). 
