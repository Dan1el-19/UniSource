# Backend — Endpointy API

Wszystkie endpointy wymagają nagłówka `X-Service-ID` (np. `usrc`).

Formaty odpowiedzi błędów: `{ error: string, message: string }`.

---

## Publiczne (bez auth)

### `GET /health`
Zwraca status serwera.

### `GET /public/:slug`
Pobiera informacje o publicznym linku do pliku.

**Odpowiedź — plik bez hasła:**
```json
{
  "file_id": "string",
  "filename": "string",
  "size": 12345,
  "mime_type": "application/pdf",
  "requires_password": false,
  "download_url": "https://...",
  "url_expires_at": 1234567890,
  "link_name": "string | null",
  "link_expires_at": "number | null"
}
```

**Odpowiedź — plik chroniony hasłem:**
```json
{
  "filename": "string",
  "size": 12345,
  "mime_type": "application/pdf",
  "requires_password": true,
  "link_name": "string | null"
}
```

**Błędy:** `404` slug nie istnieje/nieaktywny, `410` link wygasł lub osiągnięto limit pobrań.

### `POST /public/:slug/unlock`
Odblokuj plik chroniony hasłem.

**Body:**
```json
{ "password": "string" }
```

**Odpowiedź:** Jak `GET /public/:slug` dla pliku bez hasła.

### `GET /public/:slug/download?token=...`
Pobierz plik (binarny stream).

**Query:** `token` — podpisany token (HMAC-SHA256) z endpointu `/public/:slug`.

**Nagłówki odpowiedzi:** `Content-Disposition`, `Content-Type`, `Cache-Control: no-store`.

---

## Upload (`POST /upload/*`)

Wymaga auth (JWT lub API key). Endpointy inicjalizacji są rate-limited.

### `POST /upload/r2/init`

**Body:**
```json
{
  "filename": "dokument.pdf",
  "size": 1048576,
  "mime_type": "application/pdf",
  "folder_id": "optional-string-or-null"
}
```

**Odpowiedź `201`:**
```json
{
  "upload_id": "uuid",
  "destination": "r2",
  "presigned_url": "https://r2.example.com/...",
  "storage_key": "usrc/uploads/2026/05/07/uuid.pdf",
  "bucket": "unisource",
  "expires_at": 1234567890
}
```

**Błędy:** `409` quota przekroczona, `413` plik za duży.

### `POST /upload/appwrite/init`

**Body:** Identyczny jak R2.

**Odpowiedź `201`:**
```json
{
  "upload_id": "uuid",
  "destination": "appwrite",
  "appwrite_endpoint": "https://cloud.appwrite.io/v1",
  "appwrite_project_id": "string",
  "appwrite_bucket_id": "string",
  "file_id": "string",
  "expires_at": 1234567890
}
```

### `POST /upload/complete`

**Body:** `{ "upload_id": "uuid" }`

**Odpowiedź `200`:**
```json
{ "success": true, "upload_id": "uuid", "status": "completed" }
```

**Błędy:** `404` upload nie istnieje, `410` upload wygasł.

### `POST /upload/fail`

**Body:** `{ "upload_id": "uuid" }`

**Odpowiedź `200`:**
```json
{ "success": true, "upload_id": "uuid", "status": "failed" }
```

---

## Pliki użytkownika (`/my-files/*`)

Wymagają JWT (auth użytkownika).

### `GET /my-files`

**Query:**
| Parametr | Typ | Domyślny | Opis |
|---|---|---|---|
| `folder_id` | `string \| null` | brak | Filtruj po folderze (null = root) |
| `limit` | `1–100` | `20` | Liczba wyników |
| `cursor` | `string` | brak | Kursor paginacji |

**Odpowiedź `200`:**
```json
{
  "items": [{ "id": "...", "filename": "...", "size": 0, "mime_type": "...",
              "storage_destination": "r2", "is_trashed": false,
              "folder_id": null, "created_at": 0, "updated_at": 0 }],
  "next_cursor": "string | null",
  "limit": 20
}
```

### `GET /my-files/trash`
Lista tylko usuniętych plików. Query: `cursor`, `limit`.

### `GET /my-files/:id`
Szczegóły pliku. **`404`** jeśli nie istnieje lub należy do innego użytkownika.

### `GET /my-files/:id/download-url`

**Odpowiedź `200`:**
```json
{
  "upload_id": "uuid",
  "destination": "r2",
  "download_url": "https://...",
  "expires_at": 1234567890
}
```

**Błędy:** `409` plik jest w koszu.

### `DELETE /my-files/:id`

**Query:** `permanent=true` dla trwałego usunięcia.

**Odpowiedź `200`:**
```json
{ "success": true, "id": "uuid", "permanent": false }
```

Trwałe usunięcie kasuje plik z R2/Appwrite, dezaktywuje share linki, zwalnia quota.

### `POST /my-files/:id/restore`
Przywraca plik z kosza. **`404`** jeśli nie jest w koszu.

### `PATCH /my-files/:id`
Zmiana nazwy pliku.

**Body:** `{ "filename": "nowa-nazwa.pdf" }` (1–255 znaków)

**Odpowiedź:** `{ "file": FileRecord }`

### `PATCH /my-files/:id/move`
Przeniesienie do folderu.

**Body:**
```json
{ "folder_id": "target-folder-id" }
```
`folder_id: null` przenosi do roota. Folder musi należeć do tego samego użytkownika i serwisu.

---

## Foldery (`/folders/*`)

Wymagają JWT.

### `POST /folders`

**Body:**
```json
{
  "name": "Dokumenty",
  "parent_id": "optional-uuid",
  "color_tag": "optional-string"
}
```

**Odpowiedź `201`:**
```json
{
  "folder": {
    "id": "uuid", "name": "Dokumenty", "parent_id": null,
    "color_tag": null, "is_trashed": false, "trashed_at": null,
    "created_at": 0, "updated_at": 0
  }
}
```

**Błędy:** Folder nadrzędny musi istnieć, należeć do użytkownika i nie być w koszu.

### `GET /folders`

**Query:** `parent_id`, `trashed` (boolean), `cursor`, `limit`.

### `GET /folders/:id`

### `PATCH /folders/:id`

**Body:** `{ "name": "Nowa nazwa", "color_tag": "blue" }` (oba opcjonalne)

### `DELETE /folders/:id`

**Query:** `permanent=true` dla trwałego usunięcia.

Trwałe usunięcie: rekurencyjnie usuwa wszystkie podfoldery, soft-trashuje pliki w tych folderach.

**Odpowiedź:**
```json
{ "success": true, "id": "uuid", "permanent": true, "folders_deleted": 5 }
```

### `POST /folders/:id/restore`
Przywraca folder z kosza.

---

## Share Linki

Wymagają JWT.

### `POST /my-files/:fileId/share-links`

**Body (wszystkie opcjonalne):**
```json
{
  "slug": "moj-plik",
  "name": "Opis linku",
  "password": "haslo123",
  "expires_at": 1234567890,
  "max_downloads": 10
}
```

Jeśli `slug` nie podany — generowany automatycznie (10 znaków).

**Odpowiedź `201`:**
```json
{
  "link": {
    "id": "uuid", "slug": "moj-plik", "name": null,
    "has_password": true, "expires_at": null,
    "download_count": 0, "max_downloads": null,
    "is_active": true, "created_at": 0, "updated_at": 0
  }
}
```

**Błędy:** `409` slug zajęty. Plik musi należeć do użytkownika i nie być w koszu.

### `GET /my-files/:fileId/share-links`
Lista wszystkich share linków pliku.

### `PATCH /share-links/:linkId`

**Body (wszystkie opcjonalne):**
```json
{
  "name": "Nowa nazwa",
  "is_active": false,
  "password": null,
  "expires_at": null,
  "max_downloads": null
}
```
`password: null` usuwa hasło.

### `DELETE /share-links/:linkId`
**Odpowiedź:** `{ "success": true, "id": "uuid" }`

---

## Admin (`/admin/*`)

Wymagają admin auth (API key lub JWT użytkownika z etykietą `admin`).

### `GET /admin/service`
Szczegóły konfiguracji serwisu.

**Odpowiedź:**
```json
{
  "service": {
    "id": "usrc", "name": "UniSource",
    "max_storage_bytes": 16106127360,
    "current_used_bytes": 1048576,
    "max_file_size_bytes": 536870912,
    "created_at": 0
  }
}
```

### `PATCH /admin/service`

**Body:**
```json
{
  "max_storage_bytes": 32212254720,
  "max_file_size_bytes": 1073741824
}
```

### `GET /admin/service/usage`

**Odpowiedź:**
```json
{
  "service_id": "usrc",
  "max_storage_bytes": 16106127360,
  "current_used_bytes": 5242880,
  "used_percent": 0.05
}
```

### `GET /admin/audit-log`

**Query:**
| Parametr | Typ | Opis |
|---|---|---|
| `user_id` | `string` | Filtruj po użytkowniku |
| `action` | `upload_completed \| file_deleted \| folder_deleted \| quota_exceeded \| share_link_accessed` | Filtruj po akcji |
| `resource_type` | `file \| folder \| service` | Filtruj po typie zasobu |
| `cursor` | `string` | Kursor paginacji |
| `limit` | `1–200` | Domyślnie `25` |

### `GET /admin/users`

**Query:** `search`, `offset`, `limit` (1–100, domyślnie 25).

**Odpowiedź:**
```json
{
  "items": [{
    "id": "uuid", "name": "Jan Kowalski", "email": "jan@example.com",
    "status": true, "labels": [], "role": "user",
    "has_service_access": true,
    "max_storage_bytes": null,
    "effective_max_storage_bytes": 16106127360,
    "current_used_bytes": 1048576,
    "registration": 0, "email_verification": true
  }],
  "total": 100, "offset": 0, "limit": 25
}
```

### `PATCH /admin/users/:userId`

**Body (wszystkie opcjonalne):**
```json
{
  "name": "Jan Kowalski",
  "email": "jan@example.com",
  "status": true,
  "labels": ["admin"],
  "role": "admin",
  "max_storage_bytes": null
}
```

`max_storage_bytes: null` — użytkownik dziedziczy limit serwisu.

### `POST /admin/users/:userId/password`

**Body:** `{ "password": "min8znaków" }`

---

## Kody błędów

| Status | Znaczenie |
|---|---|
| `400` | Błąd walidacji żądania |
| `401` | Brak lub nieprawidłowe credentials |
| `403` | Brak uprawnień (admin / inny serwis) |
| `404` | Zasób nie istnieje (lub nie należy do użytkownika) |
| `409` | Konflikt (plik w koszu, quota, slug zajęty) |
| `410` | Zasób wygasł (upload/link/limit pobrań) |
| `413` | Plik za duży |
| `429` | Zbyt wiele żądań (rate limit) |
| `502` | Błąd R2 lub Appwrite |
| `500` | Nieoczekiwany błąd serwera |
