# Pliki i Foldery (API)

Zarządzanie podstawowymi zasobami chmurowymi. Operacje wymagają uwierzytelnienia.

## Foldery (`/folders`)

### Pobieranie listy folderów
**`GET /folders?parent_id=null&limit=50&cursor=XYZ`**
Zwraca listę folderów na danym poziomie hierarchii.

Zwraca:
```json
{
  "items": [
    {
      "id": "fol_123",
      "service_id": "usrc",
      "user_id": "usr_999",
      "parent_id": null,
      "name": "Moje Wakacje",
      "color_tag": "#FF0000",
      "is_trashed": false,
      "trashed_at": null,
      "created_at": 1710000000,
      "updated_at": 1710000000
    }
  ],
  "next_cursor": "abc",
  "limit": 50
}
```

### Tworzenie folderu
**`POST /folders`**
Oczekuje:
```json
{
  "name": "Faktury 2026",
  "parent_id": "fol_123", // Opcjonalnie
  "color_tag": "#00FF00" // Opcjonalnie
}
```
Zwraca: `{ "folder": { /* obiekt folderu */ } }`

### Aktualizacja folderu
**`PATCH /folders/:id`**
Oczekuje przynajmniej jednego pola:
```json
{
  "name": "Nowa nazwa",
  "color_tag": null
}
```

### Usuwanie folderu
**`DELETE /folders/:id?permanent=false`**
Domyślnie przenosi do kosza. Flaga `permanent=true` usuwa definitywnie drzewo katalogów i powiązanych plików.
Zwraca: `{ "success": true, "id": "fol_123", "permanent": false }`

---

## Pliki (`/files`)

### Pobieranie metadanych pliku
**`GET /files/:id`**
Zwraca informacje o pojedynczym pliku.

Zwraca:
```json
{
  "file": {
    "id": "file_888",
    "service_id": "usrc",
    "user_id": "usr_999",
    "folder_id": "fol_123",
    "upload_id": "ul_123",
    "filename": "faktura.pdf",
    "size": 50000,
    "mime_type": "application/pdf",
    "storage_destination": "r2",
    "is_trashed": false,
    "trashed_at": null,
    "created_at": 1710000000,
    "updated_at": 1710000000
  }
}
```

### Pobranie linku download
**`GET /files/:id/download-url`**
Generuje tymczasowy URL, dzięki któremu przeglądarka bezpiecznie pobierze plik.
Zwraca:
```json
{
  "upload_id": "ul_123",
  "destination": "r2",
  "download_url": "https://<R2_URL>/...",
  "expires_at": 1715000000
}
```

### Aktualizacja pliku (Zmiana nazwy)
**`PATCH /files/:id`**
Oczekuje:
```json
{
  "filename": "nowa_nazwa.pdf"
}
```

### Przeniesienie pliku do innego folderu
**`PATCH /my-files/:id/move`**
Oczekuje:
```json
{
  "folder_id": "fol_444" // albo null dla katalogu głównego
}
```

### Usunięcie pliku
**`DELETE /files/:id?permanent=false`**
Domyślnie to tzw. "soft-delete". Plik ląduje w koszu.

### Odtworzenie z kosza
**`POST /files/:id/restore`**
Zwraca: `{ "success": true, "id": "file_888" }`
