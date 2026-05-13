# Diagnoza problemów — UniSource / chmura-blokserwis

Data: 2026-05-13

---

## 1. Appwrite Storage nie używa UUID do nazw plików (ryzyko nadpisywania)

**Status: POTWIERDZONY — realny problem**

R2 używa pełnego UUID v4:
```
usrc/uploads/2026/05/13/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg
```
➜ `buildStorageKey()` w `apps/backend/src/config/services.ts:39`

Appwrite używa UUID obciętego do 20 znaków hex:
```
usrc/uploads/2026/05/13/a1b2c3d4e5f67890ab
```
➜ `apps/backend/src/routes/upload.ts:208` — `crypto.randomUUID().replace(/-/g, '').slice(0, 20)`

**Ryzyko:** 20 znaków hex (80 bitów) kontra pełne UUID (122 bity). Przy dużej liczbie plików prawdopodobieństwo kolizji rośnie. Appwrite powinien używać tej samej funkcji `buildStorageKey()` co R2 albo przynajmniej pełnego UUID.

**Fix:** Zamienić generowanie fileId na pełny UUID i użyć `buildStorageKey()` tak jak R2.

**Pliki:**
- `apps/backend/src/routes/upload.ts:208-209`
- `apps/backend/src/config/services.ts:39-43`

---

## 2. Hybrydowe podejście do uploadu ignoruje ustawienia admina

**Status: POTWIERDZONY — dwie osobne usterki**

### (A) `resolveAutoDestination()` ignoruje `recommended_upload_destination`

W `upload.svelte.ts:19-23`:
```ts
const AUTO_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024;
function resolveAutoDestination(sizeBytes: number): UploadDestination {
  return sizeBytes > AUTO_THRESHOLD_BYTES ? 'r2' : 'appwrite';
}
```
Funkcja używa **tylko** rozmiaru pliku (próg 5 GiB) i nigdy nie sprawdza `recommended_upload_destination` z ustawień admina. Użytkownik klika główny przycisk "Upload" → `'auto'`, a backendowe ustawienie admina jest kompletnie ignorowane.

### (B) Dropdown oferuje dwie ścieżki ale nie hybrid

Dropdown pokazuje "Upload do Cloudflare R2" i "Upload do Appwrite Storage" — brak opcji "Auto (zalecane)".

**Pliki:**
- `apps/frontend/src/lib/modules/upload.svelte.ts:19-23` (lub `chmura-blokserwis/src/lib/modules/upload.svelte.ts:19-23`)
- `chmura-blokserwis/src/lib/components/upload/UploadSplitButton.svelte`

---

## 3. UI ustawień nie przewiduje trybu hybrydowego

**Status: POTWIERDZONY — brak 3 opcji**

### (A) Backend — CHECK constraint blokuje "hybrid"

Migracja `0014_multipart_and_settings.sql:14`:
```sql
CHECK(recommended_upload_destination IN ('r2', 'appwrite'))
```
Typ w `services.ts:44`: `recommended_upload_destination: 'r2' | 'appwrite'`

Hybryda nie jest przewidziana w schemie bazy danych.

### (B) Frontend — tylko 2 radio-buttony

`admin/settings/+page.svelte` — tylko "Cloudflare R2" i "Appwrite Storage". Brak opcji "Hybrid (automatyczny wybór wg rozmiaru pliku)".

**Fix:** Dodać 'hybrid' do enuma w DB + typów + UI (3 radio-buttony).

**Pliki:**
- `apps/backend/src/db/migrations/0014_multipart_and_settings.sql:13-14`
- `apps/backend/src/db/services.ts:44,121`
- `chmura-blokserwis/src/routes/admin/settings/+page.svelte`

---

## 4. Brak aktywnego progress bara przy uploadzie do Appwrite

**Status: POTWIERDZONY — problem z Appwrite SDK**

W `upload.svelte.ts:491-509`:
```ts
await storage.createFile({
  onProgress: (progress) => {
    // onProgress is only called for files > 5 MB (chunked uploads).
    const pct = progress.progress ?? 0;
    this.updateProgress(file, Math.max(15, Math.min(95, Math.round(pct * 0.8 + 15))));
  }
});
// For files ≤ 5 MB the SDK skips chunking and never calls onProgress.
this.updateProgress(file, 95);
```

**Przebieg dla pliku ≤ 5 MB (Appwrite):**
- Start: **5%**
- Po inicjalizacji: **15%**
- ...progress bar zamrożony na 15% przez cały upload...
- Po zakończeniu SDK: skok na **95%**
- Po `/upload/complete`: **100%** → toast → znika po 3s

**Fix:** Użyć XHR z `upload.onprogress` zamiast Appwrite SDK dla uploadu, albo dodać timer symulujący progress.

**Pliki:**
- `chmura-blokserwis/src/lib/modules/upload.svelte.ts:445-509`

---

## 5. Pliki nie usuwają się z bucketa — soft-delete bez UI kosza

**Status: POTWIERDZONY — krytyczny UX gap**

### Backend (działa poprawnie):
- `DELETE /my-files/:id` (bez `?permanent=true`) → `is_trashed=1` (soft-delete)
- `DELETE /my-files/:id?permanent=true` → fizyczne usunięcie z R2/Appwrite + DB
- `POST /my-files/:id/restore` → przywraca z kosza
- `GET /my-files/trash` → lista plików w koszu

### Frontend (nie używa backendu):
- `FileBrowser.svelte:59` → `fetch(endpoint, { method: 'DELETE' })` — **bez parametru permanent**
- `SelectionBar.svelte:19` → to samo
- Brak widoku kosza (strony `/trash`)
- Brak przycisków "Przywróć" / "Usuń trwale"
- SDK ma gotowe metody `client.myFiles.trash()` i `client.myFiles.restore()` — nieużywane

**Efekt:** Pliki fizycznie zostają w bucketach (Appwrite/R2), nie ma sposobu ich przywrócić ani trwale usunąć z UI.

**Pliki:**
- `chmura-blokserwis/src/lib/components/files/FileBrowser.svelte:55-69`
- `chmura-blokserwis/src/lib/components/files/SelectionBar.svelte:13-25`
- `chmura-blokserwis/src/routes/api/files/[fileId]/+server.ts:41`

---

## 6. Backend jest zawiły — redundancja i niekonsekwencja

**Status: POTWIERDZONY**

### (A) Dwie ścieżki API dla tego samego
- `routes/fileRecords.ts` → `/my-files/*`
- `routes/userFiles.ts` → `/files/*` (Plan 2 mirror)
- Obie implementują te same operacje — podwójny kod.

### (B) Dwa osobne ID dla jednego uploadu Appwrite
- `uploadId` — pełny UUID (do DB)
- `fileId` — UUID obcięty do 20 znaków (Appwrite file ID + storage key)
- Niejasne rozróżnienie.

### (C) `is_main_storage` przez osobne route-y
- Zamiast flagi w standardowych endpointach, są osobne route-y `/main/*` (`mainStorage.ts`).
- Logika rozbita na 3 pliki: `fileRecords.ts`, `userFiles.ts`, `mainStorage.ts`.

### (D) Zmienne środowiskowe z konkatenacją
```ts
apiKeyEnvVar: 'USRC_' + 'API_KEY',
```
Nieczytelne.

### (E) Domyślny fallback `serviceId` do `'usrc'`
- Gdy brak `X-Service-ID`, system domyślnie używa `usrc`. Ryzyko wycieku danych między tenantami.

### (F) Monolityczny `upload.ts` (460+ linii)
- Wszystkie providery w jednym pliku: init R2, init Appwrite, complete, fail, multipart create/sign/list/complete/abort.

**Pliki:**
- `apps/backend/src/routes/fileRecords.ts`
- `apps/backend/src/routes/userFiles.ts`
- `apps/backend/src/routes/mainStorage.ts`
- `apps/backend/src/routes/upload.ts`
- `apps/backend/src/config/services.ts`
- `apps/backend/src/index.ts`

---

## Priorytety naprawcze

| # | Problem | Priorytet | Wpływ |
|---|---------|-----------|-------|
| 2+3 | Auto-upload ignoruje ustawienia, brak hybrid | Krytyczny | Userzy widzą pliki nie tam gdzie admin ustawił |
| 5 | Soft-delete bez kosza UI | Krytyczny | Pliki w bucketach, brak RODO compliance |
| 4 | Zamrożony progress bar Appwrite | Wysoki | UX psuje zaufanie |
| 1 | Appwrite nie używa UUID | Średni | Ryzyko kolizji przy skali |
| 6 | Backend zawiłość | Niski | Utrudnia rozwój |
