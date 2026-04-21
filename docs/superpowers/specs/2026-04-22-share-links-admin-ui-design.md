# UniSource — Share Links + Admin UI + Luki Spójności

**Data:** 2026-04-22  
**Podejście:** D1 + SvelteKit public route (Podejście A)

---

## 1. Zakres

### 1.1 Zamknięcie luk spójności
- Restore folderu z kosza w TrashBrowser (backend i SDK gotowe, brak UI)
- Admin panel `/admin` — service info, usage meter, audit log, lista uploadów

### 1.2 Nowy feature: Share Links
Publiczne linki do plików z pełną gamą funkcji:
- Wiele linków na jeden plik
- Nazwane linki (np. "Dla klienta X")
- Custom slug lub autogenerowany
- Data wygaśnięcia
- Ochrona hasłem
- Limit pobrań (`max_downloads`)
- Ręczna dezaktywacja (`is_active`)
- R2: świeży presigned GET URL przy każdym wejściu
- Appwrite: file token przy każdym wejściu

---

## 2. Baza danych (D1)

### Nowa tabela `share_links`

```sql
CREATE TABLE share_links (
  id              TEXT PRIMARY KEY,
  service_id      TEXT NOT NULL,
  file_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,

  slug            TEXT NOT NULL UNIQUE,
  name            TEXT,

  password_hash   TEXT,
  expires_at      INTEGER,

  download_count  INTEGER NOT NULL DEFAULT 0,
  max_downloads   INTEGER,

  is_active       INTEGER NOT NULL DEFAULT 1,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_share_links_slug    ON share_links(slug);
CREATE INDEX idx_share_links_file_id ON share_links(file_id, service_id);
CREATE INDEX idx_share_links_user_id ON share_links(user_id, service_id);
```

**Uwagi:**
- `slug` unikalny globalnie — umożliwia custom URL `/s/moj-link`
- `password_hash` — bcrypt (lub Web Crypto PBKDF2, bo Workers nie mają bcrypt natywnie — używamy `crypto.subtle`)
- `max_downloads = NULL` → bez limitu
- `expires_at = NULL` → wieczny
- Jeden plik może mieć wiele wierszy (wiele linków)
- Przy permanent delete pliku: kaskadowo soft-deactivate powiązanych linków (is_active=0) lub hard delete

---

## 3. Backend (Hono)

### 3.1 Trasy chronione (JWT) — CRUD linków

```
POST   /my-files/:fileId/share-links          # utwórz link
GET    /my-files/:fileId/share-links          # lista linków dla pliku
PATCH  /share-links/:linkId                   # edytuj (name, expires_at, max_downloads, is_active, password)
DELETE /share-links/:linkId                   # usuń link
```

Middleware: `authMiddleware` (JWT only — właściciel pliku)

**POST /my-files/:fileId/share-links** — body:
```typescript
{
  slug?: string;          // custom slug, opcjonalny — backend generuje jeśli brak
  name?: string;          // etykieta linku
  password?: string;      // plaintext — backend hashuje
  expires_at?: number;    // unix timestamp
  max_downloads?: number; // limit pobrań
}
```

**PATCH /share-links/:linkId** — body (wszystkie pola opcjonalne):
```typescript
{
  name?: string;
  is_active?: boolean;
  password?: string | null;  // null = usuwa hasło
  expires_at?: number | null;
  max_downloads?: number | null;
}
```

### 3.2 Trasa publiczna (brak auth)

```
GET  /public/:slug          # info o pliku + generuje download URL (inkrementuje licznik)
POST /public/:slug/unlock   # weryfikuje hasło, zwraca ephemeral token
```

**GET /public/:slug** — logika:
1. Znajdź link po slug
2. Sprawdź `is_active = 1`
3. Sprawdź `expires_at` (jeśli ustawiony)
4. Sprawdź `download_count < max_downloads` (jeśli ustawiony)
5. Jeśli `password_hash != NULL` → zwróć `{ requires_password: true, ... }` bez URL
6. Jeśli brak hasła → wygeneruj download URL (R2 presigned / Appwrite token), inkrementuj licznik, zwróć

**POST /public/:slug/unlock** — body: `{ password: string }`
- Weryfikuje hasło PBKDF2
- Jeśli OK → generuje download URL, inkrementuje licznik
- Jeśli błąd → 401

**Odpowiedź GET /public/:slug (bez hasła lub po unlock):**
```typescript
{
  file_id: string;
  filename: string;
  size: number;
  mime_type: string;
  requires_password: false;
  download_url: string;
  expires_at: number;        // URL expiry
  link_name?: string;
  link_expires_at?: number;  // link expiry
}
```

**Odpowiedź GET /public/:slug (z hasłem):**
```typescript
{
  filename: string;
  size: number;
  mime_type: string;
  requires_password: true;
  link_name?: string;
}
```

### 3.3 Hashowanie haseł (Web Crypto PBKDF2)

Workers nie mają bcrypt. Używamy `crypto.subtle`:
- PBKDF2, SHA-256, 100_000 iteracji
- Salt: 16 random bytes, zapisany razem z hashem (hex-encoded: `salt:hash`)

### 3.4 Logowanie eventów

Przy pobraniu przez publiczny link: `logServiceEvent` z nową akcją `share_link_accessed`:
```
action: 'share_link_accessed'
resource_type: 'file'
resource_id: file_id
metadata: { slug, link_id }
```

Rozszerzamy enum akcji w SDK i db/services.ts.

### 3.5 Cascade przy usuwaniu pliku

W `DELETE /my-files/:id?permanent=true` — przed fizycznym delete:
```sql
UPDATE share_links SET is_active = 0 WHERE file_id = ? AND service_id = ?
```

---

## 4. SDK (`@unisource/sdk`)

### Nowy plik `shareLinks.ts`

```typescript
// Typy
export interface ShareLink { ... }
export interface ShareLinkCreateRequest { ... }
export interface ShareLinkUpdateRequest { ... }
export interface ShareLinkListResponse { ... }
export interface ShareLinkCreateResponse { ... }
export interface PublicFileInfoResponse { ... }   // requires_password: true
export interface PublicFileAccessResponse { ... } // requires_password: false + download_url
```

### Nowy namespace w `UnisourceClient`

```typescript
readonly shareLinks = {
  create: (fileId, body) => ...,
  list: (fileId) => ...,
  update: (linkId, body) => ...,
  delete: (linkId) => ...,
}
```

Publiczny endpoint nie wymaga auth → osobna funkcja eksportowana:
```typescript
export async function getPublicFileInfo(baseUrl, slug): Promise<...>
export async function unlockPublicFile(baseUrl, slug, password): Promise<...>
```

Rozszerzamy `AuditEventAction` o `share_link_accessed`.

---

## 5. Frontend

### 5.1 Modal udostępniania — `ShareLinksModal.svelte`

Wywoływany z context menu ("Udostępnij") i prawdopodobnie z toolbar.

**Sekcje modala:**
1. **Lista istniejących linków** — każdy link jako karta:
   - Nazwa lub auto-label (np. "Link #1")
   - URL do skopiowania (przycisk copy)
   - Status badge: aktywny / wygasł / limit wyczerpany / dezaktywowany
   - Metadane: data wygaśnięcia, licznik pobrań, ikona kłódki jeśli hasło
   - Akcje: edytuj, dezaktywuj/aktywuj, usuń

2. **Formularz nowego linku** (collapsible / "Dodaj link"):
   - Nazwa (opcjonalna)
   - Custom slug (opcjonalny) — z podglądem URL
   - Data wygaśnięcia (date picker lub preset: 1d / 7d / 30d / brak)
   - Hasło (opcjonalne, z show/hide)
   - Limit pobrań (opcjonalny)
   - Przycisk "Utwórz link"

**Design:** glass modal, slide-in z dołu na mobile (bottom sheet), centered na desktop. Glassmorphism na tle kart linków.

### 5.2 Publiczna strona `/s/[slug]` — bez auth

**`+page.server.ts`:** fetchuje `/public/:slug` — SSR dla preview (tytuł, meta OG).

**`+page.svelte`:**

Stan 1 — wymaga hasła:
- Duża ikona pliku (FileIcon z MIME)
- Nazwa pliku, rozmiar, opcjonalnie nazwa linku
- Pole hasła + przycisk "Odblokuj"
- Animacja błędu przy złym haśle

Stan 2 — dostęp OK (no password / after unlock):
- Duża ikona + nazwa + rozmiar
- Przycisk "Pobierz plik" → inicjuje download przez URL
- Subtelna info o platformie (powered by UniSource)

Stan 3 — link nieaktywny / wygasł / limit:
- Empty state z komunikatem
- Bez dalszych akcji

**Design:** minimalistyczna strona, pełnoekranowa karta na ciemnym tle, glassmorphism. Mobile-first. Brak sidebara, brak nawigacji — czyste standalone.

### 5.3 Admin panel `/admin`

**Nowa trasa `(app)/admin/+page.svelte`**

Sekcje:
1. **Service Overview** — nazwa, ID, domyślny bucket
2. **Storage Usage** — animowany pasek (usage/quota), liczby w MB/GB
3. **Audit Log** — tabela z cursor pagination, filtry: akcja, user
4. **Recent Uploads** — lista ostatnich uploadów z statusem

**Design:** grid 2 kolumny desktop / 1 kolumna mobile. Karty z glass border. Usage bar z gradientem (green→yellow→red zależnie od %).

Dodajemy "Admin" do Sidebar i BottomDock (ikona `ShieldCheck` z Lucide).

### 5.4 Restore folderu w TrashBrowser

TrashBrowser musi obsługiwać zarówno pliki jak i foldery w koszu. Aktualnie `items: FileRecord[]`.

**Zmiany:**
- Typ `TrashItem = { kind: 'file'; data: FileRecord } | { kind: 'folder'; data: Folder }`
- Równoległy fetch: `myFiles.trash()` + `folders.list({ trashed: true })`
- Render z rozróżnieniem (ikona folderu vs pliku)
- Akcje: "Przywróć" → `folders.restore(id)` lub `myFiles.restore(id)` zależnie od kind

### 5.5 Context menu — nowe pozycje

Dodajemy do `ContextMenu` dla plików:
- "Udostępnij" → otwiera `ShareLinksModal`
- Separator przed "Udostępnij"

Dla folderów "Udostępnij" nie dotyczy pierwszej wersji.

---

## 6. Bezpieczeństwo

- Publiczny endpoint `/public/:slug` nie ujawnia `storage_key`, `bucket`, ani żadnych wewnętrznych identyfikatorów
- Download URL jest ephemeral (R2: 15 min presigned, Appwrite: file token z TTL)
- Hasło nigdy nie jest logowane ani zwracane w odpowiedzi
- Rate limiting na `/public/:slug` (istniejący `rateLimitMiddleware` po IP)
- Slug auto-generowany: `nanoid(10)` — kolizja wykrywana przez UNIQUE constraint z retry

---

## 7. Migracja

Nowy plik: `apps/backend/migrations/0003_share_links.sql` (lub analogiczny schemat migracji)

Wymagane zmiany w `wrangler.toml` / D1 binding — bez zmian (używamy istniejącego `usrc_d1`).

---

## 8. Co pozostaje poza scope

- User-to-user sharing (osobny cykl)
- Search endpoint
- Bulk operations (multi-select delete/move)
- File versioning
- Real-time WebSocket updates
