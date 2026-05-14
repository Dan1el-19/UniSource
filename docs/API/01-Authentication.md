# Autoryzacja i Podstawy (API)

Każde zapytanie (poza nielicznymi wyjątkami np. endpoint `/health` czy ścieżki `/public`) wymaga ścisłego uwierzytelnienia na poziomie instancji.

## 1. Wymagane nagłówki HTTP

Model Dual-Auth weryfikuje Twoją tożsamość na dwa sposoby. W każdym żądaniu musisz przekazać:

1. **`X-Service-ID`**: Identyfikator używanej przestrzeni dzierżawcy (np. `usrc`). Serwer korzysta z niego, by wiedzieć w jakiej usłudze operujesz i do której limitów przypisać zasoby.
2. **`Authorization: Bearer <TOKEN>`**: Wartość tokenu zależy od tego kim jesteś:
   - *Użytkownik końcowy*: Użyj tokenu JWT wygenerowanego przez Appwrite po stronie klienta (np. `localStorage.getItem('appwrite_jwt')`). Backend dekoduje JWT, weryfikuje podpis Appwrite i przypisuje działania do Twojego User ID.
   - *Wywołanie Server-to-Server (Administrator)*: Podaj dedykowany globalny klucz `API Key` serwisu. Otwiera on dostęp do pełnego API, w tym ścieżek `/admin`.

## 2. Admin Preview (Imitacja użytkownika)
Jako administrator (autoryzowany przez API Key lub JWT z rolą `admin`), możesz podglądać pliki konkretnych użytkowników. Służy do tego nagłówek:

- **`X-Target-User-ID: <USER_ID>`**

Jeżeli w zapytaniu o pliki (np. `GET /files`) prześlesz ten nagłówek, otrzymasz widok jako ten konkretny użytkownik bez podawania jego hasła czy wyciągania jego JWT. Akcje wykonane pod tym nagłówkiem będą zanotowane w audycie (z Twoim identyfikatorem w polu `actor_id`).

## 3. Przykładowy Request bazowy

Wywołanie zapytania cURL pobierające strukturę folderów użytkownika:

```bash
curl -X GET "https://api.chmura.blokserwis.pl/folders" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsIn..." \
  -H "X-Service-ID: usrc" \
  -H "Content-Type: application/json"
```

## 4. Globalna autoryzacja CORS
Jeżeli żądania API wykonujesz bezpośrednio w oknie przeglądarki ze strony trzeciej frontendu, Twoja domena frontendu musi zostać dopisana na zapleczu do dozwolonych źródeł `ALLOWED_ORIGINS` w pliku zmiennych (np. zmienna Cloudflare), by API zaakceptowało Twoje nagłówki oraz wystawiło odpowiedź `Access-Control-Allow-Origin`. Opcjonalnie domyślnie wspierany jest `localhost:5173`.
