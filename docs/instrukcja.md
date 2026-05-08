# UniSource — zakres zmian przed migracją Effinity

## Kontekst

UniSource to monorepo:
- `apps/backend` — Hono na Cloudflare Workers, D1, R2, Appwrite Storage
- `packages/@unisource/sdk` — opublikowany klient npm

Effinity Cloud (osobne repo, SvelteKit + Cloud Run) zostanie przepięte na UniSource jako jedyny backend domenowy. SvelteKit zostanie jako czysty frontend bez logiki biznesowej.

Poniżej lista wszystkiego co trzeba dopisać lub poprawić w UniSource i SDK zanim migracja Effinity nastąpi.

---

## 2. Hardening istniejących endpointów

### 2.1 `/upload/complete`

Dodać przed finalizacją uploadu:
- weryfikację fizycznego istnienia obiektu w R2/Appwrite (`headObject`)
- weryfikację rozmiaru pliku względem `uploads.size`
- zabezpieczenie przed race condition przy równoczesnych wywołaniach `complete`

Jeśli obiekt nie istnieje lub rozmiar się nie zgadza:
- oznaczyć upload jako `failed`
- zwolnić zarezerwowaną quota
- zwrócić `409`

Pliki do zmiany:
- `apps/backend/src/routes/upload.ts`
- `apps/backend/src/services/r2.ts` — dodać `headObject(bucket, key)`
- `apps/backend/src/services/appwrite.ts` — dodać `getAppwriteFileMeta(bucket, fileId)`

### 2.2 `POST /public/:slug/unlock`

Dodać rate-limiting na ten endpoint. Bez tego share linki chronione hasłem można brute-force'ować.

---

## 3. Quota reconciliation

Dodać cron job lub dedykowany endpoint do:
- przeliczenia `services.current_used_bytes` z `SUM(files.size)`
- przeliczenia `service_users.current_used_bytes` z `SUM(files.size)` per user
- wykrycia i naprawienia driftu liczników
- opcjonalnego zapisu eventu w audit logu

---

## 4. System ról

Obecnie UniSource nie ma zdefiniowanych ról użytkowników. Dodać:

**Role:**
- `user` — standardowy użytkownik
- `plus` — użytkownik z dostępem do MAIN_STORAGE
- `admin` — pełny dostęp, dostęp do MAIN_STORAGE, admin preview

**Zmiany:**
- kolumna `role` w tabeli `service_users` (D1)
- middleware sprawdzające rolę tam gdzie wymagane
- SDK: rozszerzyć `admin.updateUser` o zmianę roli

---

## 5. MAIN_STORAGE

Współdzielony dysk dla ról `plus` i `admin`. Każdy user ma też swoją osobną przestrzeń — MAIN_STORAGE to dodatek, nie zamiennik.

**Wymagania:**
- Osobny wirtualny kontener storage współdzielony przez wszystkich userów z rolą `plus` i `admin`
- Operacje: listing, upload, rename, move, delete, share
- Pliki w MAIN_STORAGE mają właściciela (`uploaded_by`) ale są widoczne dla wszystkich uprawnionych ról
- Storage path sugerowany: `main/{filename}`

**Zmiany backendowe:**
- nowy model w D1 lub rozszerzenie istniejącego o flagę `is_main_storage`
- endpoint `GET /main` — listing MAIN_STORAGE
- wszystkie operacje plikowe muszą obsługiwać kontekst MAIN_STORAGE obok kontekstu prywatnego
- quota MAIN_STORAGE liczona osobno (nie wchodzi w limit prywatny usera)

**Zmiany SDK:**
- `mainStorage.list()`
- `mainStorage.upload()` — init, complete, fail (analogicznie do `upload.*`)
- `mainStorage.rename(id, name)`
- `mainStorage.move(id, folderId)`
- `mainStorage.delete(id)`

---

## 6. Admin preview

Admin może przeglądać i modyfikować pliki dowolnego usera.

**Wymagania:**
- Admin widzi pliki jako ten user (jego prywatna przestrzeń)
- Admin może wykonywać operacje: listing, rename, move, delete, restore
- Każda operacja wykonana przez admina w kontekście innego usera jest zapisywana w audit logu z aktorem (`admin_id`) i targetem (`target_user_id`)
- W UI pokazywany jest banner informujący że admin przegląda pliki konkretnego usera (to zadanie frontendowe, backend musi zwracać `viewer_role: 'admin'` w odpowiedzi)

**Zmiany backendowe:**
- Opcjonalny header `X-Target-User-ID` lub query param `targetUserId` na endpointach files/folders
- Middleware: jeśli `targetUserId` present → sprawdź czy requestujący ma rolę `admin` → podmień kontekst usera
- Audit log: każda operacja z `targetUserId` zapisuje event z `actor_id` i `target_user_id`

**Zmiany SDK:**
- Wszystkie metody `myFiles.*` i `folders.*` przyjmują opcjonalny parametr `{ asUser: userId }`
- Gdy `asUser` podany → SDK dodaje `X-Target-User-ID` header

---

## 7. Releases (moduł w UniSource)

Releases nie idą do osobnego Workera — zostają w UniSource jako osobny moduł/router. UniSource ma być jednym backendem dla całego ekosystemu.

**Model danych:**
```ts
{
  id: string
  service_id: string
  name: string
  size: number
  r2_key: string
  tags: string[]
  notes: string | null
  force_update: boolean
  uploaded_by: string
  created_at: string
}
```

**Endpointy do dodania:**
- `POST /releases/upload/init` — init multipart upload
- `POST /releases/upload/complete`
- `GET /releases` — listing z filtrowaniem po `service_id`
- `GET /releases/:id`
- `GET /releases/latest` — najnowszy release dla service
- `PATCH /releases/:id` — update metadanych
- `DELETE /releases/:id`
- `POST /releases/sync` — sync z `externalConfig.ts`

**Storage path:** `releases/{service_id}/{filename}`

**Zmiany SDK:**
- Nowy namespace `releases.*` w `@unisource/sdk`
- `releases.upload.init()`
- `releases.upload.complete()`
- `releases.list()`
- `releases.get(id)`
- `releases.latest()`
- `releases.update(id, data)`
- `releases.delete(id)`
- `releases.sync(config)`

---

## 8. Co odpada z zakresu (nie implementować)

- ZIP folder download — usunięte całkowicie
- Folder shares — poza pierwszym zakresem
- ZIP shares — poza pierwszym zakresem
- Auto-delete share flag — poza pierwszym zakresem

---

## 9. Testy do napisania

### Upload hardening
- `complete` gdy obiekt nie istnieje w R2 → 409 + failed + quota release
- `complete` gdy rozmiar się nie zgadza → 409 + failed + quota release
- double `complete` race → jeden rekord pliku, brak duplikatu quota

### Rate-limit
- brute-force `unlock` → throttle po N próbach

### Quota reconciliation
- dry-run reconciliation wykrywa drift
- reconciliation naprawia liczniki

### MAIN_STORAGE
- user `plus` widzi MAIN_STORAGE
- user `user` nie ma dostępu do MAIN_STORAGE
- upload do MAIN_STORAGE nie wchodzi w prywatny limit usera

### Admin preview
- admin może listować pliki innego usera
- non-admin nie może użyć `X-Target-User-ID`
- każda operacja admina na plikach innego usera zapisuje audit event

### Releases
- pełny lifecycle: init → upload → complete → list → latest → delete
- `force_update` flag działa poprawnie w `/releases/latest`