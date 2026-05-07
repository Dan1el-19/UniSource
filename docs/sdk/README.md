# @unisource/sdk

Typesafe klient HTTP do UniSource API. Publikowany na npm.

## Instalacja

```bash
pnpm add @unisource/sdk
```

**Wymagania:** Node.js ≥ 18 lub środowisko z `fetch` (przeglądarka, Cloudflare Workers, Deno).

## Inicjalizacja

```typescript
import { UnisourceClient } from '@unisource/sdk';

const client = new UnisourceClient({
  baseUrl: 'https://api.usrc.dev',
  serviceId: 'usrc',
  getToken: async () => {
    // Zwróć JWT z Appwrite lub API key
    return session.jwt;
  },
});
```

### Opcje konfiguracji

| Opcja | Typ | Opis |
|---|---|---|
| `baseUrl` | `string` | Adres URL backendu |
| `serviceId` | `string` | Identyfikator serwisu (wysyłany jako `X-Service-ID`) |
| `getToken` | `() => string \| null \| Promise<string \| null>` | Callback zwracający świeży token przed każdym żądaniem |

---

## Obsługa błędów

```typescript
import { UnisourceClient, UnisourceError, UnisourceNetworkError } from '@unisource/sdk';

try {
  const file = await client.myFiles.get('file-id');
} catch (err) {
  if (err instanceof UnisourceError) {
    console.log(err.status);   // np. 404
    console.log(err.body);     // { error: 'Not Found', message: '...' }
  } else if (err instanceof UnisourceNetworkError) {
    console.log(err.cause);    // oryginalny błąd sieci
  }
}
```

---

## Upload plików

### Upload do R2

```typescript
// 1. Inicjalizacja
const init = await client.upload.r2Init({
  filename: 'dokument.pdf',
  size: 1048576,
  mime_type: 'application/pdf',
  folder_id: 'optional-folder-id',
});

// 2. Upload bezpośrednio do R2
await fetch(init.presigned_url, {
  method: 'PUT',
  body: fileBlob,
  headers: { 'Content-Type': 'application/pdf' },
});

// 3. Potwierdzenie
await client.upload.complete({ upload_id: init.upload_id });
```

### Upload do Appwrite

```typescript
import { Client, Storage, ID } from 'appwrite';

const init = await client.upload.appwriteInit({
  filename: 'zdjecie.jpg',
  size: 524288,
  mime_type: 'image/jpeg',
});

const appwrite = new Client()
  .setEndpoint(init.appwrite_endpoint)
  .setProject(init.appwrite_project_id);

const storage = new Storage(appwrite);
await storage.createFile(init.appwrite_bucket_id, init.file_id, file);

await client.upload.complete({ upload_id: init.upload_id });
```

### Zgłoszenie błędu uploadu

```typescript
// Wywołaj jeśli upload się nie powiódł — zwalnia zarezerwowaną quotę
await client.upload.fail({ upload_id: init.upload_id });
```

---

## Pliki (`client.myFiles`)

```typescript
// Lista plików w folderze (null = root)
const { items, next_cursor } = await client.myFiles.list({
  folder_id: null,
  limit: 25,
  cursor: undefined,
});

// Paginacja
const next = await client.myFiles.list({ cursor: next_cursor ?? undefined });

// Szczegóły pliku
const { file } = await client.myFiles.get('file-id');

// URL do pobrania (ważny 15 minut)
const { download_url } = await client.myFiles.downloadUrl('file-id');

// Przeniesienie do folderu
await client.myFiles.move('file-id', { folder_id: 'folder-id' });
await client.myFiles.move('file-id', { folder_id: null }); // do roota

// Zmiana nazwy
await client.myFiles.update('file-id', { filename: 'nowa-nazwa.pdf' });

// Soft-delete (kosz)
await client.myFiles.delete('file-id');

// Trwałe usunięcie
await client.myFiles.delete('file-id', { permanent: true });

// Przywrócenie z kosza
await client.myFiles.restore('file-id');

// Lista kosza
const { items: trashed } = await client.myFiles.trash();
```

---

## Foldery (`client.folders`)

```typescript
// Utwórz folder
const { folder } = await client.folders.create({
  name: 'Dokumenty',
  parent_id: undefined,  // root
  color_tag: 'blue',
});

// Lista folderów (root level)
const { items } = await client.folders.list({ parent_id: null });

// Lista podfolderów
const { items: sub } = await client.folders.list({ parent_id: folder.id });

// Lista kosza
const { items: trashed } = await client.folders.list({ trashed: true });

// Zmiana nazwy / koloru
await client.folders.update(folder.id, { name: 'Archiwum' });

// Soft-delete
await client.folders.delete(folder.id);

// Trwałe usunięcie (kasuje wszystkie podfoldery i soft-trashuje pliki)
await client.folders.delete(folder.id, { permanent: true });

// Przywrócenie
await client.folders.restore(folder.id);
```

---

## Share Linki (`client.shareLinks`)

```typescript
// Utwórz link
const { link } = await client.shareLinks.create('file-id', {
  slug: 'moj-plik',          // opcjonalny (auto-generowany jeśli brak)
  name: 'Opis linku',
  password: 'haslo123',
  expires_at: Date.now() / 1000 + 86400,  // za 24h
  max_downloads: 10,
});

// Lista linków dla pliku
const { items } = await client.shareLinks.list('file-id');

// Aktualizacja linku
await client.shareLinks.update(link.id, {
  is_active: false,
  password: null,      // usuwa hasło
  max_downloads: null, // usuwa limit
});

// Usunięcie
await client.shareLinks.delete(link.id);
```

---

## Dostęp publiczny (bez auth)

```typescript
import { getPublicFileInfo, unlockPublicFile } from '@unisource/sdk';

const BASE = 'https://api.usrc.dev';

// Pobierz info o linku
const info = await getPublicFileInfo(BASE, 'moj-plik');

if (info.requires_password) {
  // Odblokuj hasłem
  const unlocked = await unlockPublicFile(BASE, 'moj-plik', 'haslo123');
  window.open(unlocked.download_url);
} else {
  window.open(info.download_url);
}
```

---

## Admin (`client.admin`)

Wymaga API key lub JWT z etykietą `admin`.

```typescript
// Status serwisu
const { service } = await client.admin.serviceDetail();

// Zużycie storage
const { used_percent } = await client.admin.usage();

// Aktualizacja limitów
await client.admin.updateService({
  max_storage_bytes: 32212254720,
  max_file_size_bytes: 1073741824,
});

// Lista uploadów (z filtrowaniem)
const { items } = await client.admin.listUploads({ status: 'pending' });

// Audit log
const { items: events } = await client.admin.auditLog({
  action: 'upload_completed',
  limit: 50,
});

// Lista użytkowników
const { items: users } = await client.admin.listUsers({ search: 'jan' });

// Aktualizacja użytkownika
await client.admin.updateUser('user-id', {
  labels: ['admin'],
  max_storage_bytes: 5368709120,  // 5 GB
});

// Reset hasła
await client.admin.resetUserPassword('user-id', { password: 'noweHaslo123' });
```

---

## Typy TypeScript

Wszystkie typy są eksportowane z pakietu:

```typescript
import type {
  // Pliki
  FileRecord,
  FileRecordsListResponse,
  FileDownloadUrlResponse,
  FileMoveRequest,
  FileUpdateRequest,

  // Foldery
  Folder,
  FolderListResponse,
  FolderCreateRequest,
  FolderUpdateRequest,

  // Upload
  UploadR2InitRequest,
  UploadR2InitResponse,
  UploadAppwriteInitRequest,
  UploadAppwriteInitResponse,
  UploadRecord,

  // Share Linki
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
  PublicFileAccessResponse,
  PublicFileLockedResponse,

  // Admin
  Service,
  AdminUser,
  AuditEvent,

  // Prymitywy
  UploadDestination,   // 'r2' | 'appwrite'
  UploadStatus,        // 'pending' | 'completed' | 'failed'
  AuditEventAction,

  // Błędy
  ApiError,
} from '@unisource/sdk';
```

---

## Stałe

```typescript
import { FILES_DEFAULT_LIMIT, FILES_MAX_LIMIT } from '@unisource/sdk';
// FILES_DEFAULT_LIMIT = 25
// FILES_MAX_LIMIT     = 100
```

---

## Budowanie i publikowanie

```bash
# Build
pnpm --filter @unisource/sdk build

# Tryb watch (dev)
pnpm --filter @unisource/sdk dev

# Nigdy nie edytuj version ręcznie — używaj changesets:
pnpm changeset              # opisz zmianę
pnpm changeset version      # bump wersji
pnpm changeset publish      # publikuj na npm
```

**Wyjście build:**
- `dist/index.mjs` — ES modules
- `dist/index.d.mts` — definicje TypeScript

---

## Walidacja (Zod)

SDK waliduje odpowiedzi z API przy użyciu schematów Zod. Jeśli backend zwróci nieoczekiwany kształt danych — zostanie rzucony błąd walidacji (nie `UnisourceError`). Typy TypeScript są wyprowadzane ze schematów Zod, co gwarantuje spójność między typami a walidacją runtime.
