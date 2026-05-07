# Backend — Przegląd

Backend UniSource to aplikacja [Hono](https://hono.dev/) uruchamiana na **Cloudflare Workers**.

## Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Baza danych | D1 (SQLite) |
| Obiektowy storage | R2 (S3-compatible) + Appwrite Storage |
| Autentykacja użytkowników | Appwrite (JWT) |
| Autentykacja serwisowa | API key (Bearer) |

## Struktura katalogów

```
apps/backend/src/
├── index.ts                   # Entry point — Hono app + cron handler
├── config/
│   └── services.ts            # Rejestr serwisów (usrc, blokserwis)
├── middleware/
│   ├── auth.ts                # Dual-mode auth (JWT + API key)
│   ├── admin.ts               # Sprawdzanie uprawnień admina
│   ├── logger.ts              # JSON request logging
│   └── ratelimit.ts           # Rate limiting (opcjonalny)
├── routes/
│   ├── upload.ts              # POST /upload/*
│   ├── files.ts               # GET|DELETE /files/* (admin)
│   ├── folders.ts             # CRUD /folders/*
│   ├── fileRecords.ts         # CRUD /my-files/*
│   ├── admin.ts               # GET|PATCH /admin/*
│   ├── shareLinks.ts          # CRUD share-links
│   └── public.ts              # GET /public/:slug (bez auth)
├── db/
│   ├── files.ts               # UploadRecord CRUD
│   ├── fileRecords.ts         # FileRecord CRUD (potwierdzone pliki)
│   ├── folders.ts             # Hierarchia folderów
│   ├── services.ts            # Serwisy, quota, audit log
│   ├── shareLinks.ts          # ShareLink CRUD
│   └── migrations/            # Migracje D1 SQL (0001–0008)
├── services/
│   ├── appwrite.ts            # Appwrite Admin API
│   └── r2.ts                  # Presigned URL generation (AWS SDK)
├── utils/
│   ├── password.ts            # PBKDF2-SHA256
│   ├── slug.ts                # Generowanie slugów
│   └── signedTokens.ts        # HMAC-SHA256 signed tokens
└── worker/
    └── cron.ts                # Cron: czyszczenie osieroconych uploadów
```

## Przepływ uploadu

```
1. Client → POST /upload/r2/init  (lub /upload/appwrite/init)
           ← { upload_id, presigned_url, ... }

2. Client → PUT presigned_url  (bezpośrednio do R2 lub Appwrite)

3. Client → POST /upload/complete  { upload_id }
           ← { success: true, status: 'completed' }
```

## Serwisy (multi-tenancy)

Backend obsługuje wiele izolowanych serwisów. Każde żądanie musi zawierać nagłówek `X-Service-ID`. Brak nagłówka domyślnie traktowany jako `'usrc'`.

Zdefiniowane serwisy:
- **`usrc`** — 15 GB max storage, 500 MB max rozmiar pliku
- **`blokserwis`** — 100 GB max storage, 2 GB max rozmiar pliku

## Zmienne środowiskowe i bindingi

### D1
```
binding: usrc_d1
database_name: usrc-d1
```

### R2
```
USRC_BUCKET      → bucket: unisource
BLOKSERWIS_BUCKET → bucket: blokserwis
```

### Sekrety (wrangler secret put)
```
USRC_API_KEY             # API key dla serwisu usrc
BLOKSERWIS_API_KEY       # API key dla serwisu blokserwis
R2_ACCOUNT_ID            # Cloudflare Account ID
R2_ACCESS_KEY_ID         # R2 access key
R2_SECRET_ACCESS_KEY     # R2 secret key
APPWRITE_ENDPOINT        # np. https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID
APPWRITE_BUCKET_ID
APPWRITE_API_KEY
```

### Rate limiter (opcjonalny)
```
binding: RATE_LIMITER
type: ratelimit
limit: 100 req / 60 s
```

## Cron

Trigger: `0 * * * *` (co godzinę)

Funkcja `cleanupOrphanedUploads()` — usuwa uploady z `status = 'pending'` starsze niż 1 godzinę: kasuje pliki z R2/Appwrite, zwalnia quota, oznacza jako `failed`.

## Dalej

- [Endpointy API](routes.md)
- [Schemat bazy danych](database.md)
- [Autentykacja i middleware](auth.md)
