# Backend — Autentykacja i Middleware

---

## Dual-mode Auth

Backend obsługuje dwa sposoby uwierzytelniania:

| Typ | Nagłówek | Kontekst |
|---|---|---|
| **JWT (Appwrite)** | `Authorization: Bearer <jwt>` lub `X-Appwrite-JWT: <jwt>` | Żądania od użytkowników (przeglądarka/frontend) |
| **API key** | `Authorization: Bearer <api-key>` | Żądania server-to-server (np. z backendu innej aplikacji) |

Backend rozróżnia oba typy próbując zweryfikować token w Appwrite — jeśli weryfikacja się nie powiedzie, sprawdzane jest dopasowanie do API key serwisu.

---

## Middleware: `auth`

**Plik:** `src/middleware/auth.ts`

Dwa tryby:

### Tryb `'user'` (JWT only)
Stosowany dla: `/folders/*`, `/my-files/*`, `/my-files/:id/share-links/*`, `/share-links/*`

- Akceptuje tylko JWT Appwrite
- Odrzuca żądania z samym API key (401)

### Tryb `'dual'` (JWT lub API key)
Stosowany dla: `/upload/*`, `/files/*`, `/admin/*`

- Akceptuje zarówno JWT jak i API key

---

## Zmienne kontekstu (WorkerVariables)

Po udanej autoryzacji middleware ustawia w kontekście Hono:

| Zmienna | Typ | Wartość |
|---|---|---|
| `userId` | `string` | ID użytkownika Appwrite, lub `'system'` dla API key |
| `serviceId` | `string` | Wartość `X-Service-ID`, domyślnie `'usrc'` |
| `authType` | `'appwrite' \| 'apikey'` | Typ użytego uwierzytelnienia |
| `isAdmin` | `boolean` | `true` jeśli JWT + etykieta `'admin'` lub auth API key |

---

## Izolacja serwisów

Każde żądanie musi zawierać nagłówek `X-Service-ID`.

- Dla serwisu `'usrc'` — dostęp jest otwarty dla wszystkich użytkowników Appwrite.
- Dla pozostałych serwisów (np. `'blokserwis'`) — użytkownik JWT musi mieć rekord w tabeli `service_users` dla tego serwisu. Jeśli nie ma — zwracany jest `403 Forbidden`.

Zapobiega to sytuacji, w której użytkownik jednego serwisu mógłby uzyskać dostęp do danych innego serwisu.

---

## Middleware: `admin`

**Plik:** `src/middleware/admin.ts`

Stosowany przed endpointami `/admin/*` i `/files/*`.

Warunek dostępu:
```
authType === 'apikey'   →  dostęp
isAdmin === true        →  dostęp (JWT z etykietą 'admin')
w pozostałych           →  403 Forbidden
```

---

## Middleware: `logger`

**Plik:** `src/middleware/logger.ts`

Loguje każde żądanie jako JSON:

```json
{
  "level": "info",
  "method": "POST",
  "path": "/upload/r2/init",
  "status": 201,
  "duration_ms": 45,
  "ip": "1.2.3.4",
  "service_id": "usrc",
  "user_id": "user-uuid",
  "auth_type": "appwrite"
}
```

- Pomijane są udane żądania `GET /health`
- Błędy 4xx logowane jako `warn`, 5xx jako `error`

---

## Middleware: `ratelimit`

**Plik:** `src/middleware/ratelimit.ts`

Opcjonalny — aktywny tylko jeśli binding `RATE_LIMITER` jest skonfigurowany w `wrangler.jsonc`.

- Limit: 100 żądań / 60 sekund per IP
- Fallback: jeśli brak IP, ogranicza per `serviceId`
- Zastosowanie: endpointy `/upload/r2/init` i `/upload/appwrite/init`
- Odpowiedź przy przekroczeniu: `429 Too Many Requests`

---

## Bezpieczeństwo

### Quota — ochrona przed race condition
Quota jest rezerwowana atomicznie przy inicjalizacji uploadu. Jeśli dwa równoległe żądania inicjalizacji przekraczają limit — drugie dostaje `409 Conflict`. Quota jest zwalniana po trwałym usunięciu pliku lub przez cron przy osieroconych uploadach.

### Cross-user upload hijacking (Bug #15)
Endpoint `/upload/complete` używa `getUploadForUser()` dla JWT auth — weryfikuje, że upload należy do wywołującego użytkownika i serwisu. Dla API key (userId=`'system'`) weryfikacja właściciela jest pomijana.

### Cross-folder move (Bug #4)
Endpoint `/my-files/:id/move` weryfikuje, że folder docelowy należy do `(user_id, service_id)` wywołującego. Zapobiega przenoszeniu pliku do folderu innego użytkownika.

### Podpisane tokeny (share link download)
Tokeny pobierania z `/public/:slug` są podpisane HMAC-SHA256. Payload: `{ slug, exp }`. Format: `base64url(payload).base64url(signature)`. Ważność: 15 minut.

### Hasła share linków
PBKDF2-SHA256, 100 000 iteracji, 16-bajtowy losowy salt. Przechowywane jako `{32-hex-salt}:{64-hex-hash}`.
