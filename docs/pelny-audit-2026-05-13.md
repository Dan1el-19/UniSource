# Pełny Audit — UniSource + chmura-blokserwis

Data: 2026-05-13 | Zakres: Backend, SDK, Frontend, Security, UI/UX, Logika, Baza danych

---

## CZĘŚĆ I: Problemy zgłoszone przez użytkownika (6 problemów)

### 1. Appwrite Storage nie używa UUID do nazw plików

**Status: POTWIERDZONY** | Priorytet: **Średni**

- **R2**: `buildStorageKey()` → pełny UUID v4 + rozszerzenie (122 bity)
- **Appwrite**: `crypto.randomUUID().replace(/-/g, '').slice(0, 20)` → 20 znaków hex (80 bitów)
- **Pliki**: `apps/backend/src/routes/upload.ts:208-209`, `apps/backend/src/config/services.ts:39-43`
- **Ryzyko**: Kolizje nazw przy dużej liczbie plików. Appwrite powinien używać `buildStorageKey()` tak jak R2.

### 2. Hybrydowe podejście do uploadu ignoruje ustawienia admina

**Status: POTWIERDZONY** | Priorytet: **Krytyczny**

- `resolveAutoDestination()` w `upload.svelte.ts:19-23` używa tylko progu 5 GiB, ignorując `recommended_upload_destination`
- Główny przycisk "Upload" → `'auto'` → nigdy nie sprawdza ustawienia admina
- Dropdown nie ma opcji "Auto (zalecane)"

### 3. UI ustawień nie przewiduje trybu hybrydowego

**Status: POTWIERDZONY** | Priorytet: **Krytyczny**

- Backend: `CHECK(recommended_upload_destination IN ('r2', 'appwrite'))` — brak 'hybrid'
- Frontend: tylko 2 radio-buttony w `admin/settings/+page.svelte`
- Typ: `recommended_upload_destination: 'r2' | 'appwrite'`

### 4. Brak aktywnego progress bara przy uploadzie do Appwrite

**Status: POTWIERDZONY** | Priorytet: **Wysoki**

- Appwrite SDK `onProgress` działa tylko dla plików > 5 MB
- Dla mniejszych plików: 5% → 15% → zamrożenie → 95% → 100%
- `upload.svelte.ts:491-509`

### 5. Pliki nie usuwają się z bucketa — soft-delete bez UI kosza

**Status: POTWIERDZONY** | Priorytet: **Krytyczny**

- Backend obsługuje soft-delete (`is_trashed=1`), przywracanie, liste kosza
- Frontend NIGDY nie wysyła `?permanent=true`, nie ma widoku kosza
- SDK ma `client.myFiles.trash()` i `client.myFiles.restore()` — nieużywane
- Efekt: pliki fizycznie zostają w bucketach, brak możliwości przywrócenia

### 6. Backend zawiłość

**Status: POTWIERDZONY** | Priorytet: **Niski**

- Dwie ścieżki API: `/my-files/*` i `/files/*` (duplikacja)
- Dwa osobne ID dla Appwrite: `uploadId` + `fileId`
- `is_main_storage` przez osobne route-y zamiast flagi
- Zmienne env z konkatenacją stringów
- Fallback `serviceId` do `'usrc'` — ryzyko wycieku między tenantami

---

## CZĘŚĆ II: Security Audit

### S1 — CRITICAL: Brak sprawdzenia roli (admin/plus) przy `is_main_storage` upload
**Plik**: `apps/backend/src/routes/upload.ts:82-164`
Dowolny użytkownik z JWT może wysłać `POST /upload/r2/init` z `is_main_storage: true` bezpośrednio do backendu. Backend musi weryfikować czy użytkownik posiada rolę `admin` lub `plus` (w tabeli `service_users`). Zwykły `user` nie ma dostępu do przestrzeni main.

### S2 — HIGH: Klucz API Appwrite użyty jako sekret HMAC dla tokenów publicznych
**Plik**: `apps/backend/src/routes/public.ts:61-63`
```ts
return `${env.APPWRITE_API_KEY}:${env.APPWRITE_PROJECT_ID}:${PUBLIC_DOWNLOAD_SCOPE}`;
```
Rotacja API key → wszystkie linki publiczne broken. API key to high-value secret.

### S3 — MEDIUM: Rate limiting wyłącza się cicho gdy brak zmiennej env
**Plik**: `apps/backend/src/middleware/ratelimit.ts:7-9`
`if (!c.env.RATE_LIMITER) { return next(); }` — brak logowania, brak ostrzeżenia.

### S4 — MEDIUM: Rate limiting na chmurze-blokserwis wyłącza się gdy Redis down
**Plik**: `chmura-blokserwis/src/hooks.server.ts:15`, `chmura-blokserwis/src/lib/server/rate-limit.ts:5-8`
Brak rate limiting na `/file/:slug` (publiczne share linki) i login page — podatne na brute-force.

### S5 — MEDIUM: Wyciek wewnętrznych error messages do klienta
**Plik**: `apps/backend/src/routes/upload.ts:679`, `apps/backend/src/routes/releases.ts:301`, `apps/backend/src/services/appwrite.ts:104`
Błędy z R2/Appwrite forwarded bezpośrednio do klienta z URL-ami, bucket ID itp.

### S6 — MEDIUM: Proxy download nie ma limitu Content-Length
**Plik**: `chmura-blokserwis/src/routes/api/proxy-download/+server.ts:18-57`
Brak maksymalnego rozmiaru pliku, brak timeoutu na fetch.

### S7 — MEDIUM: Release sync `r2_key` walidacja do bypassu z pustym prefixem
**Plik**: `apps/backend/src/routes/releases.ts:580-613`
Serwis `chmura-blokserwis` ma `objectKeyPrefix: ''` → każdy klucz zaczynający się od `releases/` przechodzi walidację.

### S8 — LOW-MEDIUM: CORS otwarty na wszystkie origin-y
**Plik**: `apps/backend/src/index.ts:24` — `app.use('*', cors())`

### S9 — LOW: Session cookie częściowo w logach debug
**Plik**: `chmura-blokserwis/src/hooks.server.ts:59-67` — `sessionCookie.substring(0, 10) + '...'`

### S10 — LOW: Release GET handler-y bez explicit auth check
**Plik**: `chmura-blokserwis/src/routes/api/releases/+server.ts:7-10` — polegają tylko na hooks

### S11 — LOW: Path traversal w nazwach plików dla release storage key
**Plik**: `apps/backend/src/config/services.ts:45-48` — `buildReleaseStorageKey` używa surowego filename

---

## CZĘŚĆ III: Backend Logic & Data Integrity

### B1 — CRITICAL: Cron zabija multipart uploady po 1h (DO USUNIĘCIA)
**Plik**: `apps/backend/src/worker/cron.ts:17`
Multipart ma TTL 7 dni w R2. Backendowy cron niszczy je po 1h. **Rozwiązanie**: Całkowite usunięcie backendowego crona na rzecz Cloudflare R2 Lifecycle Rules (Abort incomplete multipart uploads).

### B2 — CRITICAL: Cron leakuje `main_used_bytes` (DO USUNIĘCIA)
**Plik**: `apps/backend/src/worker/cron.ts:44-46`
**Rozwiązanie**: Usunięcie crona i poleganie na R2 Lifecycle.

### B3 — HIGH: `completeUpload` może się udać ale `createFileRecord` fail — brak recovery
**Plik**: `apps/backend/src/routes/upload.ts:313-350`
Upload oznaczony jako completed, ale brak rekordu w `files`. Retry dostaje 409 Conflict. Quota i storage permanentnie wyciekają.

### B4 — HIGH: Brak fizycznego czyszczenia zasobów (DO USUNIĘCIA)
**Plik**: `apps/backend/src/worker/cron.ts`
**Rozwiązanie**: Cloudflare R2 Lifecycle Rules (juz dzialajace) dla automatycznego usuwania plików z kosza/starych wersji. Backendowy cron jest zbędny i wadliwy.

### B5 — HIGH: Download count / max_downloads race condition
**Plik**: `apps/backend/src/routes/public.ts:244-257`
`incrementDownloadCount` w `waitUntil` (po odpowiedzi). Dwa równoległe requesty mogą przekroczyć `max_downloads`.

### B6 — HIGH: Brak `PRAGMA foreign_keys = ON` w całym schemacie
**Plik**: Wszystkie migracje SQL
SQLite/D1 nie wymusza FK bez tego pragma. `ON DELETE SET NULL` nie działa. Wszystkie kaskady polegają wyłącznie na kodzie aplikacyjnym.

### B7 — HIGH: Brak D1 batch dla operacji wieloetapowych
**Plik**: Wiele plików
`reserveQuota` (2 UPDATE), `completeUpload` + `createFileRecord`, `completeRelease` + `updateRelease` — wszystkie sekwencyjne, nieatomowe.

### B8 — HIGH: Nieatomowa rezerwacja quoty — ryzyko sieroty przy crashu
**Plik**: `apps/backend/src/db/services.ts:274-323`
Między incremente user quota a incremente service quota jest okno na crash. Rollback user quota może nie zadziałać.

### B9 — MEDIUM: `reconcileQuota` ignoruje `main_used_bytes`
**Plik**: `apps/backend/src/db/services.ts:386-462`

### B10 — MEDIUM: Przy wrócenie pliku z kosza nie sprawdza czy parent folder istnieje
**Plik**: `apps/backend/src/routes/fileRecords.ts:293-304`

### B11 — MEDIUM: Permanente usuwanie folderu używa sekwencyjnych DELETE — brak rollbacku
**Plik**: `apps/backend/src/routes/folders.ts:210-213`

### B12 — MEDIUM: Tag search przez LIKE dopasowuje podstringi, nie całe tagi
**Plik**: `apps/backend/src/db/releases.ts:345-361`

### B13 — MEDIUM: Admin impersonation nie audytowany dla operacji read
**Plik**: `apps/backend/src/middleware/adminPreview.ts:1-19`

### B14 — MEDIUM: Brak quota enforcement dla releases
**Plik**: `apps/backend/src/routes/releases.ts` — storage releases rośnie bez limitu

### B15 — MEDIUM: Brak czyszczenia wygasłych share linków z DB
**Plik**: `apps/backend/src/db/shareLinks.ts`

### B16 — LOW: `abortMultipartUpload` błędy cicho połykane
**Plik**: `apps/backend/src/routes/upload.ts:663,796`

### B17 — LOW: Admin files delete: najpierw physical delete, potem DB — reverse order
**Plik**: `apps/backend/src/routes/files.ts:233-257`

---

## CZĘŚĆ IV: Frontend UI/UX

### F1 — HIGH: Silent failures przy drag-drop przenoszeniu plików
**Plik**: `chmura-blokserwis/src/lib/components/files/FileTable.svelte:90-104`
Brak try/catch, brak `res.ok` check, brak error toast. Event `file-moved` odpala się zawsze.

### F2 — HIGH: Bulk delete w SelectionBar połyka błędy
**Plik**: `chmura-blokserwis/src/lib/components/files/SelectionBar.svelte:13-25`
`Promise.all` bez obsługi błędów per-item. Toast "Usunięto" pokazuje się nawet gdy niektóre DELETE fail.

### F3 — HIGH: Release page nie sprawdza `res.ok` przy edit/delete
**Plik**: `chmura-blokserwis/src/routes/releases/+page.svelte:154-185`
Dialog zamyka się i `invalidateAll()` nawet gdy API zwraca 400/500.

### F4 — HIGH: Wszystkie dialogi/modale bez ARIA
**Pliki**: `CreateFolderDialog`, `RenameDialog`, `ShareDialog`, `EditReleaseDialog`, `ReleaseUploadModal`, `ForceSyncModal`
Brak `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Screen reader nie rozpoznaje ich jako dialogi.

### F5 — HIGH: FileTable wiersze niedostępne z klawiatury
**Plik**: `chmura-blokserwis/src/lib/components/files/FileTable.svelte:56-66`
Tylko `onclick`, brak `tabindex="0"`, brak `onkeydown`. Użytkownicy klawiatury nie mogą selekcjonować plików.

### F6 — MEDIUM: Anulowanie uploadu pokazuje error toast
**Plik**: `chmura-blokserwis/src/lib/modules/upload.svelte.ts:551-556`
`AbortError` → `markFailed` → `onError` → `toast.error`. Anulowanie to intencja użytkownika, nie błąd.

### F7 — MEDIUM: Batch upload flooduje toasty
**Plik**: `chmura-blokserwis/src/lib/components/files/StoragePage.svelte:54-57`
20 plików = 20 toastów jednocześnie.

### F8 — MEDIUM: Niespójność językowa (PL/EN mix)
Toasty, buttony, formaty dat — mieszanka polskiego i angielskiego w całej aplikacji.

### F9 — MEDIUM: DateTimePicker `enableFutureDates` ma odwróconą logikę
**Plik**: `chmura-blokserwis/src/lib/components/ui/DateTimePicker.svelte:115`
`enableFutureDates={true}` → brak minValue (wszystkie daty dozwolone). Nazwa sugeruje ograniczenie do przyszłych dat. W `ShareDialog` ustawione na `true`, co pozwala ustawić datę wygaśnięcia w przeszłości.

### F10 — MEDIUM: Swipe action buttons w FileList dostępne z klawiatury gdy niewidoczne
**Plik**: `chmura-blokserwis/src/lib/components/files/FileList.svelte:47-130`

### F11 — MEDIUM: Brak custom error page (SvelteKit +error.svelte)
Domyślna strona błędu SvelteKit nie pasuje do design systemu.

### F12 — MEDIUM: ShareDialog — brak odzyskiwania hasła po utworzeniu
**Plik**: `chmura-blokserwis/src/lib/components/files/ShareDialog.svelte:81`
Hasło czyszczone z UI po utworzeniu, hashowane server-side, nie do odzyskania.

### F13 — MEDIUM: ShareDialog — hasło nie zawarte w skopiowanym linku
**Plik**: `chmura-blokserwis/src/lib/components/files/ShareDialog.svelte:113-115`

### F14 — LOW: Nieobsłużone zerowe bajty w upload
**Plik**: `chmura-blokserwis/src/lib/modules/upload.svelte.ts`
Brak `minFileSize` check. Zero-byte pliki przechodzą.

### F15 — LOW: Duplikacja `formatFileSize` — 3 implementacje
`format.ts`, `ReleaseUploadModal.svelte`, `releases/+page.svelte`

### F16 — LOW: Niespójne formatowanie dat (5 różnych formatów)
`pl-PL`, `en-US`, browser default — mieszanka w całej aplikacji.

### F17 — LOW: ShareDialog URL na 60% opacity — nieczytelny
**Plik**: `chmura-blokserwis/src/lib/components/files/ShareDialog.svelte:260`

### F18 — LOW: SelectionState.selectRange dodaje do selekcji zamiast zastępować
**Plik**: `chmura-blokserwis/src/lib/modules/selection.svelte.ts:13-21`
Niestandardowe zachowanie shift-click.

---

## CZĘŚĆ V: SDK & API Contract

### SDK1 — HIGH: Brak parametru `destination` w `admin.listUploads()`
**Plik**: `packages/unisource-sdk/src/client.ts:504`
Backend akceptuje `?destination=r2|appwrite`, SDK nie eksponuje tego filtra.

### SDK2 — HIGH: Brak SDK metody dla `/app/releases/latest`
**Plik**: `packages/unisource-sdk/src/client.ts`
Endpoint `GET /app/releases/latest` (z download URL + channel filter) nie ma odpowiednika w SDK. SDK ma tylko `releases.latest()` → `GET /releases/latest` (admin-only).

### SDK3 — MEDIUM: SDK nigdy nie waliduje odpowiedzi backendu przez Zod
Wszystkie metody używają `as Promise<T>`. Jeśli backend zmieni shape odpowiedzi, SDK cicho zwróci błędne dane.

### SDK4 — MEDIUM: `fileUpdateRequestSchema` nie ma `.max(255)` dla filename
Backend wymaga max 255 znaków, SDK nie — błąd walidacji dopiero na backendzie.

### SDK5 — MEDIUM: ReleaseDTO `created_at` to ISO string vs unix timestamp we wszystkich innych
Niespójność API.

### SDK6 — LOW: `fileRecordSchema.size` używa `positiveInt` — plik 0-bajtowy by nie przeszedł
### SDK7 — LOW: `MainStorageRenameRequest` type nie wyeksportowany
### SDK8 — LOW: Brak FK constraint na `files.upload_id` → `uploads.id`
### SDK9 — INFO: Frontend poprawnie używa wszystkich typów SDK

---

## CZĘŚĆ VI: Podsumowanie — wszystkie findingi wg priorytetu

### CRITICAL (2)
| # | Problem | Lokalizacja |
|---|---------|-------------|
| B1 | Cron zabija multipart uploady po 1h (powinien 7 dni) | `worker/cron.ts:17` |
| B2 | Cron leakuje `main_used_bytes` dla main-storage uploadów | `worker/cron.ts:44-46` |

### HIGH (9)
| # | Problem | Lokalizacja |
|---|---------|-------------|
| 2+3 | Auto-upload ignoruje ustawienia admina, brak hybrid | `upload.svelte.ts`, `admin/settings` |
| 5 | Soft-delete bez kosza UI | `FileBrowser.svelte`, `SelectionBar.svelte` |
| S1 | Brak admin check przy `is_main_storage` upload | `upload.ts:82-164` |
| S2 | Appwrite API key jako sekret HMAC | `public.ts:61-63` |
| B3 | `completeUpload` OK ale `createFileRecord` fail — brak recovery | `upload.ts:313-350` |
| B4 | Brak fizycznego czyszczenia trashed files | `worker/cron.ts` |
| B5 | Download count race condition | `public.ts:244-257` |
| B6 | Brak FK enforcement w całym schemacie | wszystkie migracje |
| B7+B8 | Brak D1 batch + nieatomowa quota | `services.ts`, wiele plików |

### MEDIUM (31)
| # | Problem | Lokalizacja |
|---|---------|-------------|
| 4 | Zamrożony progress bar Appwrite | `upload.svelte.ts:491-509` |
| 1 | Appwrite nie używa UUID | `upload.ts:208-209` |
| S3 | Rate limiting cicho wyłączony | `ratelimit.ts:7-9` |
| S4 | Rate limiting disabled gdy Redis down | `hooks.server.ts` |
| S5 | Wyciek error messages | `upload.ts:679`, `releases.ts:301` |
| S6 | Proxy download brak Content-Length limitu | `proxy-download/+server.ts` |
| S7 | Release sync r2_key bypass | `releases.ts:580-613` |
| B9 | reconcileQuota ignoruje main_used_bytes | `services.ts:386-462` |
| B10 | Restore nie sprawdza parent folder | `fileRecords.ts:293-304` |
| B11 | Folder permanent delete brak rollbacku | `folders.ts:210-213` |
| B12 | Tag search LIKE — podstringi | `releases.ts:345-361` |
| B13 | Admin impersonation nie audytowany | `adminPreview.ts` |
| B14 | Brak quota dla releases | `releases.ts` |
| B15 | Brak czyszczenia expired share links | `shareLinks.ts` |
| F6 | Anulowanie uploadu = error toast | `upload.svelte.ts:551-556` |
| F7 | Batch upload flood toastów | `StoragePage.svelte:54-57` |
| F8 | Niespójność językowa PL/EN | cały frontend |
| F9 | DateTimePicker odwrócona logika | `DateTimePicker.svelte:115` |
| F10 | Swipe buttons w tab order gdy niewidoczne | `FileList.svelte` |
| F11 | Brak custom error page | brak `+error.svelte` |
| F12 | Brak odzyskiwania hasła share | `ShareDialog.svelte:81` |
| F13 | Hasło nie w skopiowanym linku | `ShareDialog.svelte:113-115` |
| SDK1 | Brak destination filter w SDK | `client.ts:504` |
| SDK2 | Brak SDK dla /app/releases/latest | `client.ts` |
| SDK3 | SDK nie waliduje odpowiedzi | cały `client.ts` |
| SDK4 | SDK brak max(255) na filename | `fileRecords.ts:91` |
| SDK5 | ReleaseDTO created_at niespójność | `releases.ts:24` |
| F1-F5 | HIGH z frontend audytu | różne |

### LOW (26)
(Pełna lista w sekcjach powyżej)

---

## CZĘŚĆ VII: Macierz ryzyka

| Kategoria | Critical | High | Medium | Low |
|-----------|----------|------|--------|-----|
| Security | 0 | 2 | 5 | 4 |
| Data Integrity | 2 | 5 | 7 | 2 |
| UI/UX | 0 | 5 | 10 | 5 |
| SDK/Contract | 0 | 2 | 4 | 4 |
| Backend Logic | 0 | 3 | 5 | 3 |

**Razem: 2 Critical, 17 High, 31 Medium, 18 Low = 68 findingów**

---

## CZĘŚĆ VIII: Rekomendowana kolejność napraw

1. **B1, B2, B4** — Pełne usunięcie backendowego Crona i konfiguracja Cloudflare R2 Lifecycle.
2. **S1** — Weryfikacja ról `admin`/`plus` dla przestrzeni `main` w `upload.ts`.
3. **2+3** — Auto-upload ignoruje ustawienia + brak hybrid.
4. **5** — Soft-delete bez kosza UI.
5. **B6** — FK enforcement (PRAGMA foreign_keys = ON).
6. **B7+B8** — Atomowość operacji (D1 Batch).
7. **B3** — Recovery po fail createFileRecord.
8. **S2** — Sekret HMAC dla linków publicznych.
9. **4** — Progress bar Appwrite.
10. **F1-F5** — Poprawki dostępności i błędów UI.
