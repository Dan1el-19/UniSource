# Backend — Schemat bazy danych (D1)

Baza D1 to SQLite. Wszystkie znaczniki czasu to Unix timestamps (sekundy). Identyfikatory to UUID (TEXT).

---

## Tabela: `uploads`

Tymczasowe sesje uploadu. Rekordy z `status = 'pending'` są czyszczone co godzinę przez cron.

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | UUID uploadu |
| `filename` | `TEXT NOT NULL` | Oryginalna nazwa pliku |
| `size` | `INTEGER NOT NULL` | Rozmiar w bajtach |
| `mime_type` | `TEXT NOT NULL` | Typ MIME |
| `destination` | `TEXT NOT NULL` | `'r2'` lub `'appwrite'` |
| `storage_key` | `TEXT NOT NULL` | Ścieżka w R2/Appwrite |
| `bucket` | `TEXT NOT NULL` | Nazwa bucketu |
| `status` | `TEXT NOT NULL` | `'pending'`, `'completed'`, `'failed'` |
| `presigned_url` | `TEXT` | Presigned URL (tylko R2) |
| `service_id` | `TEXT NOT NULL` | Identyfikator serwisu |
| `user_id` | `TEXT` | ID użytkownika Appwrite (null dla API key) |
| `folder_id` | `TEXT` | Opcjonalny folder docelowy |
| `expires_at` | `INTEGER NOT NULL` | Wygaśnięcie uploadu (Unix ts) |
| `created_at` | `INTEGER NOT NULL` | Data utworzenia |
| `updated_at` | `INTEGER NOT NULL` | Data ostatniej zmiany |

**Format `storage_key`:**
```
usrc/uploads/2026/05/07/{uuid}.pdf
```

---

## Tabela: `files`

Potwierdzone pliki użytkowników (po wywołaniu `/upload/complete`).

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | UUID pliku |
| `user_id` | `TEXT NOT NULL` | Właściciel |
| `service_id` | `TEXT NOT NULL` | Serwis |
| `folder_id` | `TEXT` | FK → `folders.id` (SET NULL on delete) |
| `upload_id` | `TEXT UNIQUE` | FK → `uploads.id` (unikalny, zapobiega duplikatom) |
| `filename` | `TEXT NOT NULL` | Nazwa pliku |
| `size` | `INTEGER NOT NULL` | Rozmiar w bajtach |
| `mime_type` | `TEXT NOT NULL` | Typ MIME |
| `storage_destination` | `TEXT NOT NULL` | `'r2'` lub `'appwrite'` |
| `storage_key` | `TEXT NOT NULL` | Wewnętrzna ścieżka |
| `bucket` | `TEXT NOT NULL` | Bucket |
| `is_trashed` | `INTEGER NOT NULL` | `0` lub `1` (soft delete) |
| `trashed_at` | `INTEGER` | Kiedy przeniesiono do kosza |
| `created_at` | `INTEGER NOT NULL` | Data utworzenia |
| `updated_at` | `INTEGER NOT NULL` | Data ostatniej zmiany |

> Pliki nigdy nie są automatycznie kasowane z bazy — trwałe usunięcie wymaga jawnego żądania z `?permanent=true`.

---

## Tabela: `folders`

Hierarchia folderów (drzewo z self-referential FK).

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | UUID folderu |
| `user_id` | `TEXT NOT NULL` | Właściciel |
| `service_id` | `TEXT NOT NULL` | Serwis |
| `parent_id` | `TEXT` | FK → `folders.id` (SET NULL on delete) |
| `name` | `TEXT NOT NULL` | Nazwa folderu (1–255 znaków) |
| `color_tag` | `TEXT` | Opcjonalny identyfikator koloru |
| `is_trashed` | `INTEGER NOT NULL` | `0` lub `1` |
| `trashed_at` | `INTEGER` | Kiedy przeniesiono do kosza |
| `created_at` | `INTEGER NOT NULL` | |
| `updated_at` | `INTEGER NOT NULL` | |

> Trwałe usunięcie folderu używa rekurencyjnego CTE do znalezienia wszystkich podfolderów.

---

## Tabela: `services`

Konfiguracja serwisów (multi-tenancy). Rekordy są tworzone raz przy inicjalizacji.

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | Identyfikator serwisu (np. `'usrc'`) |
| `name` | `TEXT NOT NULL` | Nazwa wyświetlana |
| `default_bucket` | `TEXT NOT NULL` | Domyślny bucket R2 |
| `max_storage_bytes` | `INTEGER NOT NULL` | Limit storage serwisu |
| `current_used_bytes` | `INTEGER NOT NULL` | Aktualne zużycie |
| `max_file_size_bytes` | `INTEGER NOT NULL` | Maks. rozmiar jednego pliku |
| `created_at` | `INTEGER NOT NULL` | |

**Domyślne wartości:**
| Serwis | max_storage | max_file_size |
|---|---|---|
| `usrc` | 15 GB | 500 MB |
| `blokserwis` | 100 GB | 2 GB |

---

## Tabela: `service_users`

Quota i role per użytkownik per serwis. Tworzony przy pierwszym dostępie do serwisu.

| Kolumna | Typ | Opis |
|---|---|---|
| `service_id` | `TEXT PK+FK` | FK → `services.id` (CASCADE delete) |
| `user_id` | `TEXT PK` | ID użytkownika Appwrite |
| `role` | `TEXT NOT NULL` | `'user'` (domyślny) lub `'admin'` |
| `max_storage_bytes` | `INTEGER` | NULL = dziedzicz limit serwisu |
| `current_used_bytes` | `INTEGER NOT NULL` | Aktualne zużycie użytkownika |
| `created_at` | `INTEGER NOT NULL` | |

---

## Tabela: `share_links`

Publiczne linki do pobierania plików.

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | UUID |
| `service_id` | `TEXT NOT NULL` | Serwis |
| `file_id` | `TEXT NOT NULL` | FK → `files.id` |
| `user_id` | `TEXT NOT NULL` | Właściciel linku |
| `slug` | `TEXT NOT NULL UNIQUE` | Unikalny identyfikator URL |
| `name` | `TEXT` | Opcjonalna nazwa linku |
| `password_hash` | `TEXT` | Format: `{salt_hex}:{hash_hex}` (PBKDF2-SHA256, null = brak hasła) |
| `expires_at` | `INTEGER` | Wygaśnięcie (null = nigdy) |
| `download_count` | `INTEGER NOT NULL` | Licznik pobrań |
| `max_downloads` | `INTEGER` | Limit pobrań (null = brak limitu) |
| `is_active` | `INTEGER NOT NULL` | `1` = aktywny |
| `created_at` | `INTEGER NOT NULL` | |
| `updated_at` | `INTEGER NOT NULL` | |

**Haszowanie hasła:** PBKDF2-SHA256, 100 000 iteracji, 16-bajtowy salt. Format: `{32-hex salt}:{64-hex hash}`.

---

## Tabela: `service_user_events` (Audit Log)

Niemodyfikowalny log zdarzeń systemu.

| Kolumna | Typ | Opis |
|---|---|---|
| `id` | `TEXT PK` | UUID zdarzenia |
| `service_id` | `TEXT NOT NULL FK` | FK → `services.id` (CASCADE delete) |
| `user_id` | `TEXT NOT NULL` | Użytkownik inicjujący akcję |
| `action` | `TEXT NOT NULL` | Typ akcji (patrz niżej) |
| `resource_type` | `TEXT NOT NULL` | `'file'`, `'folder'` lub `'service'` |
| `resource_id` | `TEXT NOT NULL` | ID zasobu |
| `metadata` | `TEXT` | JSON z dodatkowymi danymi |
| `ip_address` | `TEXT` | IP klienta |
| `created_at` | `INTEGER NOT NULL` | |

**Typy akcji:**
- `upload_completed`
- `file_deleted`
- `folder_deleted`
- `quota_exceeded`
- `share_link_accessed`

---

## Migracje

```
migrations/
├── 0001_uploads.sql               # Tabela uploads
├── 0002_files_and_folders.sql     # Tabele files i folders
├── 0003_multi_service_and_fixes.sql # service_id, service_users
├── 0004_composite_indexes.sql     # Indeksy złożone
├── 0005_audit_logs.sql            # Tabela service_user_events
├── 0006_uploads_folder_id.sql     # Kolumna folder_id w uploads
├── 0007_share_links.sql           # Tabela share_links
└── 0008_admin_user_management.sql # Kolumny zarządzania użytkownikami
```

Uruchomienie migracji:
```bash
pnpm --filter backend wrangler d1 migrations apply usrc-d1
```

---

## Paginacja kursorowa

Wszystkie listy używają paginacji kursorowej (nie offset). Format kursora: `{created_at}:{id}`.

Zapytanie używa warunku:
```sql
WHERE (created_at < ? OR (created_at = ? AND id < ?))
ORDER BY created_at DESC, id DESC
LIMIT ?
```

Jeśli `next_cursor` w odpowiedzi jest `null` — nie ma więcej wyników.
