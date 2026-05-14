# API - Panel Administracyjny (Admin)

Część ta wymaga od uwierzytelnionego żądania najwyższych uprawnień (`admin`). Udostępnia pełny wgląd w zużycie zasobów całego serwisu oraz w zarządzanie użytkownikami.

## 1. Monitorowanie serwisu
**`GET /admin/service`**
Pobiera globalne informacje o instancji (limity pojemności, rozmiary, ustawienia).
Zwraca:
```json
{
  "service": {
    "id": "usrc",
    "name": "UniSource Production",
    "max_storage_bytes": 100000000000,
    "current_used_bytes": 5000000,
    "max_file_size_bytes": 500000000,
    "recommended_upload_destination": "r2",
    "created_at": 1700000000
  }
}
```

**`GET /admin/service/usage`**
Statystyka do dashboardów "na żywo":
```json
{
  "service_id": "usrc",
  "max_storage_bytes": 100000000000,
  "current_used_bytes": 5000000,
  "used_percent": 0.005
}
```

## 2. Zmiana ustawień / Limitów
**`PATCH /admin/service`**
Aktualizacja ograniczeń dla całego serwera.
```json
{
  "max_storage_bytes": 200000000000,
  "max_file_size_bytes": 1000000000
}
```

**`PATCH /admin/service/settings`**
Zmiana domyślnego providera bez naruszania limitów.
```json
{
  "recommended_upload_destination": "appwrite" // r2 lub appwrite
}
```

## 3. Zarządzanie użytkownikami (`/admin/users`)

Ta ścieżka współpracuje w tle bezpośrednio z autoryzacją z Appwrite oraz łączy ją z relacyjną bazą D1.

**`GET /admin/users?limit=50&offset=0`**
Zwraca wszystkich użytkowników w usłudze.
```json
{
  "items": [
    {
      "id": "usr_999",
      "name": "Jan Kowalski",
      "email": "jan@example.com",
      "status": true,
      "labels": [],
      "role": "admin",
      "has_service_access": true,
      "max_storage_bytes": null, // null = dziedziczy z usługi
      "effective_max_storage_bytes": 100000000000,
      "current_used_bytes": 0,
      "registration": 1700000000,
      "email_verification": true
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50
}
```

**`PATCH /admin/users/:userId/role`**
Zmienia nadaną w D1 rolę.
```json
{ "role": "plus" } // user, plus, admin
```

**`PATCH /admin/users/:userId/storage-limit`**
Nakłada sztywny przydział pamięci (override) dla danego klienta.
```json
{ "limit_bytes": 5000000000 } // lub null by powrócić do globalnych ustawień
```

**`POST /admin/users/:userId/password`**
Wymusza w Appwrite ustawienie nowego hasła z poziomu admina, automatycznie traci ważność wcześniejszych sesji usera.
```json
{ "password": "nowe_bezpieczne_haslo_123" }
```
Zwraca: `{ "success": true, "user_id": "usr_999" }`

## 4. Dziennik Audytu (Audit Log)
Dziennik zapisujący każde ważne zdarzenie dla celów analitycznych i prawnych.
**`GET /admin/audit-log`**
Możliwe query: `user_id`, `action`, `resource_type`, `limit`, `cursor`.
Zwraca:
```json
{
  "items": [
    {
      "id": "evt_123",
      "service_id": "usrc",
      "user_id": "usr_999",
      "action": "file_deleted",
      "resource_type": "file",
      "resource_id": "file_888",
      "metadata": { "filename": "faktura.pdf" },
      "ip_address": "192.168.0.1",
      "actor_id": "admin_123", // jeśli akcję wyzwolono w trybie admin-preview
      "target_user_id": "usr_999",
      "created_at": 1715000000
    }
  ],
  "next_cursor": null,
  "limit": 50
}
```
