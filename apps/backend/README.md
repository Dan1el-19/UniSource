# Unisource Backend API

Aplikacja backendowa oparta na frameworku [Hono](https://hono.dev/), działająca w środowisku **Cloudflare Workers**. Zapewnia pełną obsługę zarządzania plikami, folderami, przesyłaniem plików (upload), udostępnianiem publicznym oraz administracją użytkownikami i usługami.

## Architektura i Główne Moduły

Backend obsługuje różnorodne operacje poprzez zestaw wyspecjalizowanych routerów:

- **Upload** (`/upload`): Obsługa przesyłania plików, zarówno metodą multipart dla Cloudflare R2, jak i bezpośrednio przez SDK Appwrite.
- **Zarządzanie Plikami i Folderami** (`/my-files`, `/files`, `/folders`): CRUD dla struktury katalogów oraz samych plików przypisanych do użytkowników.
- **Udostępnianie** (`/share-links`, `/shares`, `/public`): Tworzenie linków publicznych (także zabezpieczonych hasłem) i zarządzanie współdzieleniem plików.
- **Releases** (`/releases`, `/app`): Dystrybucja aplikacji (wydania beta/stable) dla klientów końcowych.
- **Główny Magazyn** (`/main`): Panel administracyjny do zarządzania główną pulą plików serwisu (`MAIN_STORAGE`).
- **Administracja** (`/admin`): Zarządzanie limitami usług, audytem (Audit Logs) oraz limitami i uprawnieniami użytkowników w Appwrite.

Dodatkowo aplikacja posiada wbudowane warstwy (Middlewares) zapewniające:
- Autoryzację i sprawdzanie ról (Dual-Auth: JWT lub API Key).
- Poprawność zapytań CORS.
- Integralność bazy danych SQLite D1 (wymuszanie kluczy obcych i operacji kaskadowych).
- Logowanie operacji.

## Wymagania

Aplikacja wymaga skonfigurowanego środowiska Cloudflare (D1, R2, Variables) zdefiniowanych w pliku `wrangler.jsonc` i `.dev.vars`.

## Rozwój lokalny (Development)

W katalogu głównym repozytorium (monorepo):

```bash
# Instalacja zależności
pnpm install

# Uruchomienie deweloperskiego serwera lokalnego (Wrangler)
pnpm --filter backend dev
```

Do generowania i synchronizowania typów TypeScript w oparciu o środowisko Cloudflare:

```bash
pnpm --filter backend cf-typegen
```

W kodzie (`src/index.ts`) dostępne zmienne środowiskowe wiązane są poprzez interfejs `CloudflareBindings`:
```ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```

## Testy i Typowanie

Uruchomienie testów e2e (korzystających z Cloudflare Workers Vitest pool) oraz sprawdzania typów:

```bash
pnpm --filter backend check  # Uruchamia type-check oraz e2e
pnpm --filter backend test   # Uruchamia tylko testy
```

## Wdrożenie (Deployment)

Pakiet `apps/backend` jest zdefiniowany jako prywatny workspace (`"private": true`) i nie jest publikowany do rejestru NPM.

Wdrożenia na środowisko produkcyjne Cloudflare Workers dokonywane są poprzez commitowanie do głównej gałęzi, a także można je przeprowadzić ręcznie za pomocą CLI Wranglera:

```bash
pnpm --filter backend build
pnpm --filter backend deploy
```

Wersjonowanie (git tagi typu `backend@1.2.0`) realizuje się zgodnie ze strategią zdefiniowaną w głównym pliku repozytorium.
