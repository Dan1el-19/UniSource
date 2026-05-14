# API - Udostępnianie (Share Links)

Ten moduł (dostępny przeważnie pod ścieżkami `/shares` i `/public`) odpowiada za tworzenie publicznych odnośników do plików. Dzięki niemu zewnętrzni użytkownicy, niezalogowani w systemie, mogą mieć wgląd lub możliwość pobrania wybranych zasobów.

## 1. Tworzenie publicznego odnośnika
**`POST /shares`**

Wymaga poprawnej autoryzacji właściciela pliku.
Oczekuje (Request Body):
```json
{
  "file_id": "file_888",
  "name": "Moje notatki", // Opcjonalnie, max 128 znaków
  "expires_at": 1750000000, // Opcjonalnie, timestamp UNIX wygaśnięcia
  "max_downloads": 10, // Opcjonalnie, ile razy można pobrać plik
  "password": "tajne_haslo" // Opcjonalnie, narzuca blokadę dostępu
}
```

Zwraca:
```json
{
  "link": {
    "id": "share_123",
    "service_id": "usrc",
    "file_id": "file_888",
    "user_id": "usr_999",
    "slug": "nie-zalezy-od-hasha", // Unikalny identyfikator używany w /public
    "name": "Moje notatki",
    "has_password": true,
    "expires_at": 1750000000,
    "download_count": 0,
    "max_downloads": 10,
    "is_active": true,
    "created_at": 1715000000,
    "updated_at": 1715000000
  }
}
```

## 2. Pobieranie listy współdzielonych linków
**`GET /shares`**

Zwraca listę wszystkich linków wygenerowanych przez danego użytkownika dla wszystkich jego plików.
Zwraca:
```json
{
  "items": [
    { /* obiekt share link */ }
  ]
}
```

## 3. Przeglądanie detali linku
**`GET /shares/:id`**

Zwraca:
```json
{
  "link": { /* obiekt share link */ }
}
```

## 4. Anulowanie współdzielenia
**`DELETE /shares/:id`**

Od razu blokuje możliwość pobierania lub wyświetlania publicznego, plik staje się na nowo prywatny w kontekście danego `slug` (nawet jeśli wygenerowano ich więcej).
Zwraca: `{ "success": true, "id": "share_123" }`

---

## 5. Dostęp Publiczny (Brak Auth)

W tej części serwera, uderzają zewnętrzni goście (np. z linku wysłanego na slack).

### Odczyt statusu / metadanych
**`GET /public/:slug`**

Jeśli plik wymaga hasła (status zablokowany):
Zwraca (200 OK):
```json
{
  "filename": "faktura.pdf",
  "size": 50000,
  "mime_type": "application/pdf",
  "requires_password": true,
  "link_name": "Moje notatki"
}
```

Jeśli plik **nie** wymaga hasła (odblokowany domyślnie):
Zwraca (200 OK):
```json
{
  "file_id": "file_888",
  "filename": "faktura.pdf",
  "size": 50000,
  "mime_type": "application/pdf",
  "requires_password": false,
  "download_url": "https://<R2_URL>/...",
  "url_expires_at": 1715000000,
  "link_name": "Moje notatki",
  "link_expires_at": null
}
```

### Odblokowanie chronionego pliku
Gdy użytkownik wpisze hasło na frontendzie, wysyła żądanie do API.
**`POST /public/:slug/unlock`**

Oczekuje:
```json
{
  "password": "tajne_haslo"
}
```

Gdy poprawne, zwraca to samo co powyżej dla odblokowanego pliku:
```json
{
  "file_id": "file_888",
  "filename": "faktura.pdf",
  "size": 50000,
  "mime_type": "application/pdf",
  "requires_password": false,
  "download_url": "https://<R2_URL>/...",
  "url_expires_at": 1715000000,
  "link_name": "Moje notatki",
  "link_expires_at": null
}
```
Jeśli hasło błędne, zwraca typowy `ApiError` z kodem HTTP 401 lub 403.
