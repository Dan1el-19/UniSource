# Upload (API)

Moduł ten służy do wznawialnego i wieloczęściowego przesyłania plików. Zależnie od konfiguracji i preferencji, pliki są wysyłane do Cloudflare R2 lub do instancji Appwrite.

## 1. Upload jednoczęściowy do R2

Używane do mniejszych plików, w których możemy wykonać bezpośrednio zapytanie `PUT` na zwrócony `presigned_url`.

### Inicjalizacja uploadu
**`POST /upload/r2/init`**

Oczekuje (Request Body):
```json
{
  "filename": "dokument.pdf",
  "size": 1024000,
  "mime_type": "application/pdf",
  "folder_id": "optional-folder-id",
  "is_main_storage": false // Opcjonalnie
}
```

Zwraca (Response):
```json
{
  "upload_id": "ul_abc123",
  "destination": "r2",
  "presigned_url": "https://<R2_URL>/...",
  "storage_key": "some-random-key-dokument.pdf",
  "bucket": "usrc-uploads",
  "expires_at": 1715632120
}
```

Po pomyślnej wysyłce, na adres zwrócony w `presigned_url`, musisz sfinalizować upload:

### Finalizacja uploadu
**`POST /upload/complete`**

Oczekuje (Request Body):
```json
{
  "upload_id": "ul_abc123",
  "is_main_storage": false
}
```

Zwraca:
```json
{
  "success": true,
  "upload_id": "ul_abc123",
  "status": "completed"
}
```

---

## 2. Upload wieloczęściowy (Multipart R2)

Służy do uploadu bardzo dużych plików (np. kilkadziesiąt gigabajtów). Proces ten składa się z wielu etapów.

### Krok 1. Utworzenie sesji
**`POST /upload/r2/multipart/create`**
Parametry body są takie same jak dla inicjalizacji (np. `filename`, `size`, `mime_type`, `folder_id`).
Zwraca:
```json
{
  "upload_id": "ul_multi123",
  "r2_upload_id": "r2_internal_multipart_id",
  "key": "some-key",
  "bucket": "usrc-uploads",
  "expires_at": 1715632120
}
```

### Krok 2. Pobranie linku dla fragmentu (Part)
Z każdym blokiem wykonujesz zapytanie do serwera.
**`GET /upload/r2/multipart/sign-part?upload_id=ul_multi123&part_number=1`**
Zwraca:
```json
{
  "url": "https://<R2_URL>/...&partNumber=1",
  "expires_at": 1715632120
}
```
*Na ten URL wykonujesz upload binarny (PUT). Otrzymasz w nim nagłówek ETag, który musisz zapisać.*

### Krok 3. Wylistowanie wgranych fragmentów (Opcjonalnie, do wznowienia)
**`GET /upload/r2/multipart/list-parts?upload_id=ul_multi123`**
Zwraca:
```json
{
  "parts": [
    { "PartNumber": 1, "ETag": "\"hash-string-here\"", "Size": 5242880 }
  ]
}
```

### Krok 4. Finalizacja Multipart
Wysyłasz tablicę przetworzonych kawałków na serwer, by je złączył.
**`POST /upload/r2/multipart/complete`**
Oczekuje:
```json
{
  "upload_id": "ul_multi123",
  "parts": [
    { "PartNumber": 1, "ETag": "\"hash-string-here\"" }
  ]
}
```
Zwraca analogicznie do `/upload/complete`.

---

## 3. Przerwanie / Anulowanie
**`POST /upload/fail`**
Jeśli wysyłka się posypie po stronie klienta, zawiadom API, aby uwolniło zarezerwowaną przestrzeń konta.
```json
{
  "upload_id": "ul_abc123"
}
```
Dla multipart istnieje odpowiednik niszczący części w R2:
**`DELETE /upload/r2/multipart/abort`**
Body: `{ "upload_id": "ul_multi123" }`
