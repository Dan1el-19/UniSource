# @unisource/sdk

Główne, współdzielone biblioteki oraz klient HTTP (SDK) wykorzystywane zarówno przez aplikację `frontend`, jak i `backend` (w ramach repozytorium UniSource).

## Zawartość pakietu

SDK zapewnia pojedyncze źródło prawdy dla kontraktów API i upraszcza komunikację z backendem. Zawiera m.in.:

- **Zod Schemas & TypeScript Types**: Pełne definicje typów dla wszystkich encji w systemie: Pliki, Foldery, Udostępnienia (Share Links), Upload (w tym Multipart), Magazyn (Main Storage), Usługi (Services), Role Użytkowników oraz Audyty (Audit Logs).
- **UnisourceClient**: Silnie typowany klient HTTP służący do bezpiecznej komunikacji z API z uwzględnieniem identyfikacji usługi (`X-Service-ID`) oraz autoryzacji (JWT/API Key).
- **Publiczne Helpery**: Samodzielne metody do obsługi udostępnionych, publicznych linków (bez wymagania logowania) takie jak `getPublicFileInfo()` czy `unlockPublicFile()`.
- **Obsługa Błędów**: Precyzyjne klasy błędów `UnisourceError` oraz `UnisourceNetworkError`.

## Użycie (Usage)

Przykład konfiguracji i pobrania listy plików przypisanych do użytkownika przy wykorzystaniu instancji klienta:

```ts
import { UnisourceClient } from '@unisource/sdk';

// 1. Konfiguracja klienta
const client = new UnisourceClient({
  baseUrl: 'https://api.usrc.dev',
  serviceId: 'usrc',
  getToken: async () => 'twoj-token-jwt-lub-api-key', // Zwróć null dla zapytań publicznych
});

// 2. Zapytanie API (np. lista plików z paginacją)
const files = await client.myFiles.list({ folder_id: null, limit: 25 });
```

### Obsługa udostępnień publicznych
Zapytania o zasoby publiczne nie wymagają pełnej inicjalizacji klienta i posiadają dedykowane, lekkie metody:

```ts
import { getPublicFileInfo, unlockPublicFile } from '@unisource/sdk';

// Pobranie metadanych udostępnionego pliku na podstawie slug'a
const info = await getPublicFileInfo('https://api.usrc.dev', 'moj-unikalny-slug');

// Odblokowanie dostępu do pliku chronionego hasłem
const unlocked = await unlockPublicFile('https://api.usrc.dev', 'moj-unikalny-slug', 'tajne-haslo123');
```

## Rozwój lokalny (Development)

W ramach monorepo (narzędzie pnpm):

```bash
# Instalacja wszystkich zależności (w roocie)
pnpm install

# Kompilacja SDK
pnpm --filter @unisource/sdk build

# Sprawdzanie typów
pnpm --filter @unisource/sdk typecheck

# Uruchomienie testów
pnpm --filter @unisource/sdk test
```

Pakiet może być linkowany lokalnie w ramach workspace, wystarczy w innym projekcie monorepo dodać zależność:
`"@unisource/sdk": "workspace:*"`

## Wydawanie nowej wersji (Release Workflow)

Pakiet `@unisource/sdk` jest pakietem publicznym na rejestrze NPM i korzysta z narzędzia [Changesets](https://github.com/changesets/changesets) do zarządzania wersjami.

Aby opublikować nową wersję, wykonaj poniższe kroki z głównego katalogu (root) monorepo:

```bash
# 1. Dodaj plik z opisem zmian (wybierz paczkę, typ bumpa i napisz komentarz)
pnpm changeset

# 2. Zatwierdź nową wersję na podstawie plików changeset (aktualizacja package.json oraz CHANGELOG.md)
pnpm changeset version

# 3. Zbuduj SDK by upewnić się, że kod wynikowy jest poprawny
pnpm --filter @unisource/sdk build

# 4. Sprawdź przed publikacją
pnpm --filter @unisource/sdk publish --dry-run --access public --no-git-checks

# 5. Opublikuj na rejestr NPM
pnpm changeset publish
```
Pamiętaj o dodaniu nowo powstałych tagów i commitów do głównego repozytorium po opublikowaniu paczki.
