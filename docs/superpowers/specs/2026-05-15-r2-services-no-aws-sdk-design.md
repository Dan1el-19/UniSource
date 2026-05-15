# R2 services bez AWS SDK — migracja na R2 binding + aws4fetch

**Data:** 2026-05-15
**Repo:** UniSource (`apps/backend`)
**Powiązane:** chmura-blokserwis (proxy, bez zmian)

## Problem

Multipart upload przez Uppy AwsS3 plugin failuje na produkcji błędem:

```
ReferenceError: DOMParser is not defined
    at parseXML (_worker.js:76250:5)
    at XmlShapeDeserializer.parseXml
```

Przyczyna: AWS SDK v3 (`@aws-sdk/client-s3`) używa `DOMParser` do parsowania odpowiedzi XML z S3/R2. `DOMParser` nie jest dostępny w runtime Cloudflare Workers.

Operacje UniSource backend, które uderzają w ten błąd (każda parsuje XML response z R2):

- `CreateMultipartUpload` — sprawia że `/releases/upload/multipart/create` i `/upload/r2/multipart/create` zwracają 500
- `CompleteMultipartUpload`
- `AbortMultipartUpload`
- `ListParts`
- `HeadObject` (wywoływany po complete release/file — tykająca bomba)
- `DeleteObject`

`getSignedUrl` z `@aws-sdk/s3-request-presigner` to czysta kryptografia SigV4 (bez wywołań sieciowych), więc presigned URL same w sobie działają — single-shot PUT przez `/upload/init` działa poprawnie. Wszystko, co rzeczywiście woła R2 z workera, failuje.

Chmura-blokserwis jest już czystym proxy (refactor wcześniejszy, `docs/plan-releases-multipart.md`) — błąd jest po stronie UniSource backend.

## TL;DR decyzji

- **Zakres**: cały `apps/backend/src/services/r2.ts` przepisany. AWS SDK odcięte w tym samym PR. Drop-in replacement — sygnatury helperów zachowane.
- **Strategia**: hybrid. R2 binding dla operacji backendowych (head, delete, multipart create/complete/abort). aws4fetch dla presigned URL i listParts.
- **XML parsing**: `fast-xml-parser` (pure JS, działa w Workers, nie używa DOMParser). Tylko dla 1 operacji: ListParts.
- **Testy**: nowe od zera (binding-first), nie adaptowane mocki AWS SDK.
- **In-flight uploads**: bez drainowania. Cloudflare gwarantuje interop S3 ↔ Workers API dla istniejących uploadId. Staging smoke test potwierdza.
- **`USRC_BUCKET` / `usrc` service**: zostają. Migracja nie rusza modelu serwisów ani fallbacków auth. Note o przyszłym cleanup w `CLAUDE.md`.

## Architektura

### Granice migracji

```
apps/backend/src/services/r2.ts                ← jedyny punkt wymiany (~280 linii)
apps/backend/src/services/r2/sigv4.ts          ← NOWY: aws4fetch wrap-up
apps/backend/src/services/r2/list-parts-xml.ts ← NOWY: XML parser dla ListParts
apps/backend/src/routes/{upload,releases,files,
  userFiles,fileRecords,public,app,mainStorage}.ts
                                               ← BEZ ZMIAN (konsumenci helperów)
apps/backend/test/r2-service.test.ts           ← PRZEPISANY OD ZERA
apps/backend/test/r2-list-parts-xml.test.ts    ← NOWY
apps/backend/test/r2-sigv4.test.ts             ← NOWY
apps/backend/test/integration/multipart-mixed.smoke.ts ← NOWY (ręczny)
apps/backend/wrangler.jsonc                    ← usunąć alias `@aws-sdk/xml-builder/...`
apps/backend/package.json                      ← -aws-sdk, +aws4fetch, +fast-xml-parser
apps/backend/CLAUDE.md                         ← dopisać note o przyszłym cleanup `usrc`
```

`scripts/abort-multipart-uploads.ts` w chmura-blokserwis pozostaje na `@aws-sdk/client-s3` jako Node CLI tool (DOMParser dostępny w Node.js).

### Mapowanie helperów

| Helper | Sygnatura (bez zmian) | Implementacja po migracji |
|---|---|---|
| `headObject` | `(env, bucket, key) → R2ObjectMeta \| null` | `bucket.head(key)` — zwraca null dla 404 |
| `deleteObject` | `(env, bucket, key) → void` | `bucket.delete(key)` — idempotentne |
| `createMultipartUpload` | `(env, bucket, key, mime) → { upload_id }` | `bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime } })` |
| `completeMultipartUpload` | `(env, bucket, key, uploadId, parts) → { etag }` | `bucket.resumeMultipartUpload(key, uploadId).complete(orderedParts)` |
| `abortMultipartUpload` | `(env, bucket, key, uploadId) → void` | `bucket.resumeMultipartUpload(key, uploadId).abort()` |
| `generatePresignedPutUrl` | `(env, bucket, key, mime, expiresIn?) → PresignedUploadResult` | aws4fetch SigV4 sign, method PUT |
| `generatePresignedGetUrl` | `(env, bucket, key, expiresIn?) → PresignedDownloadResult` | aws4fetch SigV4 sign, method GET |
| `signUploadPart` | `(env, bucket, key, uploadId, partNumber, expiresIn?) → MultipartSignPartResult` | aws4fetch SigV4 sign, method PUT, query `?uploadId&partNumber` |
| `listUploadedParts` | `(env, bucket, key, uploadId) → MultipartUploadedPart[]` | aws4fetch GET + paginated XML parse (recovery only) |

### Wewnętrzny lookup bindingu

```ts
function bindingByBucketName(env: CloudflareBindings, bucketName: string): R2Bucket {
  for (const svc of Object.values(SERVICES)) {
    if (svc.bucketName === bucketName) {
      const binding = (env as unknown as Record<string, R2Bucket>)[svc.bucketEnvKey];
      if (!binding) throw new Error(`R2 binding not configured: ${svc.bucketEnvKey}`);
      return binding;
    }
  }
  throw new Error(`Unknown R2 bucket: ${bucketName} (not in SERVICES map)`);
}
```

To jest dodatkowa warstwa obrony — backend nie może uderzyć bucketu, który nie jest skonfigurowany jako binding.

### Dlaczego sygnatury zostają

30+ call-site w 8 routes używa wzorca `(env, svcConfig.bucketName, key, ...)`. Refactor sygnatur na `R2Bucket` wymagałby dotknięcia każdego z nich. Zachowanie sygnatur = drop-in replacement = mniejszy diff, mniejsze ryzyko regresji. Refactor na `R2Bucket` parameter — osobny PR.

## Cloudflare Free plan constraints

**Workers Free:** 10 ms CPU per request (HMAC, XML parsing, JSON parsing, walidacja liczą się; oczekiwanie na fetch/R2/D1 NIE).

Konsekwencje dla designu:

- **HMAC-SHA256 dla SigV4 presigned URL**: ~1-2 ms — bezpieczne.
- **fast-xml-parser dla 1 strony ListParts (1000 części)**: ~5-10 ms — na granicy budżetu.
- **10 iteracji listParts** (~50-100 ms CPU): **przekracza Free plan**.

**Wniosek**: `listUploadedParts` jest **recovery/debug-only**. NIE może leżeć na ścieżce happy-path. Normal complete flow nigdy nie wywołuje listParts — `completeMultipartUpload` używa parts z request body (od Uppy). Klient (Uppy) zbiera ETagi z response każdego PUT'a.

`listUploadedParts` używany jest **wyłącznie** w endpoincie `GET /upload/r2/multipart/list-parts` (Uppy Golden Retriever resume po crash/reload tab). Klient ma fallback: jeśli list-parts failuje, upload zaczyna od nowa.

## Kontrakt helperów

### Zachowanie publicznych typów

`MultipartCreateResult`, `MultipartSignPartResult`, `MultipartUploadedPart`, `MultipartPartInput`, `MultipartCompleteResult`, `R2ObjectMeta`, `PresignedUploadResult`, `PresignedDownloadResult` — bez zmian. Routes nie wiedzą, że coś się zmieniło.

### `headObject` — uproszczone mapowanie błędów

```ts
const obj = await bucket.head(key);
return obj ? { size: obj.size } : null;
```

R2 binding zwraca `null` dla brakującego klucza (nie rzuca). Stary kod miał branch'e `NoSuchKey`/`NotFound`/`$metadata.httpStatusCode === 404` — niepotrzebne. Inne błędy (uprawnienia, sieć) re-throw bez zmian.

### `completeMultipartUpload` — strip cudzysłowów ETag

S3 API zwraca ETag części w cudzysłowach (`"d41..."`) — Uppy je zachowuje. R2 binding `R2MultipartUpload.complete()` oczekuje ETag **bez** cudzysłowów.

```ts
const ordered = parts
  .slice()
  .sort((a, b) => a.PartNumber - b.PartNumber)
  .map(p => ({
    partNumber: p.PartNumber,
    etag: p.ETag.replace(/^"|"$/g, ''),  // strip dla bindingu
  }));
const obj = await mpu.complete(ordered);
return { etag: obj.httpEtag ?? null };  // httpEtag z cudzysłowami — kontrakt klienta zachowany
```

**Walidacja parts przed complete** (helper, nie route — defensive):
- `parts.length > 0`
- `PartNumber` integer 1..10000
- brak duplikatów `PartNumber`
- `ETag` niepusty string
- sort rosnąco po `PartNumber`

Naruszenie → throw z opisem (route mapuje na 400).

### `signUploadPart` — Content-Type NIE podpisany

**Pułapka SigV4**: jeśli presigned URL podpisuje header `Content-Type`, klient MUSI wysłać dokładnie ten sam `Content-Type` w PUT — inaczej R2 zwraca 403 SignatureDoesNotMatch. Stary kod (S3 SDK) **nie podpisywał** Content-Type. Nowy musi to zachować.

```ts
const url = `${baseUrl}?uploadId=${uploadId}&partNumber=${partNumber}`;
const signed = await client.sign(url, {
  method: 'PUT',
  aws: { signQuery: true, allHeaders: false },
  // headers pominięte — bez Content-Type, signedHeaders=host only
});
return { url: signed.url, expires_at: ... };
```

aws4fetch z `signQuery: true` i pustym body domyślnie podpisuje tylko `host`. Test musi to zweryfikować (`X-Amz-SignedHeaders=host` w query string).

### `listUploadedParts` — paginacja i hard limit

```
Pętla:
  request = GET /<bucket>/<key>?uploadId=<id>&max-parts=1000[&part-number-marker=<m>]
  if !response.ok:
    body = await response.text()
    throw Error(`ListParts failed: ${response.status} ${parseS3ErrorCode(body) ?? ''}`)
  xml = await response.text()
  parsed = parseListPartsResponse(xml)
  push parsed.parts
  if !parsed.isTruncated || !parsed.nextPartNumberMarker: break
  marker = parsed.nextPartNumberMarker
Limit: 10 iteracji.
Po 10 iteracji: throw Error('listUploadedParts exceeded max iterations (10 pages × 1000 parts)')
```

Po nie-OK fetch (gdy nie czytamy body do końca): `response.body?.cancel()` — Cloudflare zaleca to dla zwolnienia zasobów.

ETag w odpowiedzi parse'owany **z cudzysłowami** (Uppy oczekuje formatu z cudzysłowami).

## Flow danych

### Multipart upload (browser → R2 direct)

```
1. Browser POST /upload/r2/multipart/create
   → chmura proxy → UniSource POST /upload/r2/multipart/create
   → reserveQuota(D1)
   → createMultipartUpload(env, bucket, key, mime)
       = bucket.createMultipartUpload(key, { httpMetadata: { contentType: mime } })  [R2 BINDING]
   → INSERT do uploads (D1) z r2_upload_id
   ← 201 { upload_id, r2_upload_id, key, bucket, expires_at }

2. Browser pętla po częściach (5 MiB+ each, równolegle):
   2a. GET /upload/r2/multipart/sign-part?upload_id&part_number=N
       → chmura proxy → UniSource
       → signUploadPart(env, bucket, key, r2_upload_id, N)  [AWS4FETCH presign]
       ← 200 { url, expires_at }
   2b. PUT <signed-url> body=<part-bytes>  [browser ↔ R2 direct]
       ← response z ETag w cudzysłowach
       Uppy zapamiętuje { PartNumber: N, ETag: '"..."' }

3. Browser POST /upload/r2/multipart/complete body: { upload_id, parts: [...] }
   → chmura proxy → UniSource POST /upload/r2/multipart/complete
   → completeMultipartUpload(env, bucket, key, r2_upload_id, parts)
       = bucket.resumeMultipartUpload(key, r2_upload_id)
           .complete(parts.sort().map(p => ({
             partNumber: p.PartNumber,
             etag: p.ETag.replace(/^"|"$/g, ''),  // STRIP
           })))                                                        [R2 BINDING]
   → headObject(env, bucket, key)                                       [R2 BINDING]
   → markUploadComplete(D1)
   ← 200 { success, status: 'completed' }
```

**Krytyczny szczegół**: `r2_upload_id` z `bucket.createMultipartUpload()` jest interoperable z S3 API. Cloudflare gwarantuje to explicite ("multipart upload can be immediately interacted with globally, either through the Workers API, or through the S3 API"). Smoke test potwierdza w obu kierunkach.

### Single-shot PUT presigned

```
1. POST /upload/init → reserveQuota(D1) → INSERT
2. generatePresignedPutUrl(env, bucket, key, mime, 3600)  [AWS4FETCH]
3. ← { presigned_url, expires_at, storage_key }
4. Browser PUT <presigned_url> body=<file-bytes>  [direct do R2]
5. POST /upload/complete body: { upload_id, size }
6. headObject(env, bucket, key)  [R2 BINDING — verify size]
7. markUploadComplete(D1)
```

### Download GET presigned

```
1. GET /files/:id/download
2. lookup w D1 → bucket+key
3. generatePresignedGetUrl(env, bucket, key, 900)  [AWS4FETCH]
4. 302 redirect do presigned URL → browser pobiera direct z R2
```

### Co się NIE zmienia

- Format `r2_upload_id` (string, S3-compatible)
- Format ETag w response do klienta (z cudzysłowami)
- Kontrakt JSON każdego endpointu
- Format presigned URL (S3-style, `X-Amz-Algorithm`, `X-Amz-Date` itd.)
- TTL: 3600s (single PUT), 900s (sign-part, GET download)
- Wszystkie ścieżki D1 (reserveQuota, INSERT, completeRelease, getReleaseMultipartContext)
- Walidacja `assertPresignedUrlMatchesR2Config` w chmura — aws4fetch tworzy URL na ten sam wzorzec (path-style)

### Co się zmienia (niewidocznie)

- Latencja R2 binding < HTTP do R2 endpoint dla 5 operacji backendowych
- Bundle size workera spada o ~1-2 MB (AWS SDK to ciężka biblioteka)
- CPU: SigV4 dla presigned URL bez zmian; XML parsing zniknie z 4 operacji (zostaje tylko ListParts, recovery-only)

## Error handling i edge cases

### Mapowanie błędów per helper

| Helper | Failure |
|---|---|
| `headObject` | Re-throw dla błędów uprawnień/sieci. NIE rzuca dla 404 (zwraca null). |
| `deleteObject` | Re-throw dla uprawnień; nie rzuca dla missing key (idempotent) |
| `createMultipartUpload` | R2 binding rzuca rzadko (policy/quota) — re-throw, route mapuje na 502 |
| `signUploadPart` / `generate*Url` | aws4fetch rzuca tylko dla niepoprawnych credentials — re-throw (500) |
| `listUploadedParts` | aws4fetch failure → re-throw z S3 error code; XML parse failure → throw `Error('Invalid ListParts response')`; 404 NoSuchUpload → throw (route mapuje na 404); >10 stron → throw |
| `completeMultipartUpload` | Walidacja parts → throw 400; binding rzuca jeśli upload completed/aborted/ETag mismatch → re-throw, route'y mają fallback (sprawdzają D1 status) |
| `abortMultipartUpload` | Best-effort. Call-site mają `.catch(() => undefined)`. |

### Idempotencja `completeMultipartUpload`

Helper rzuca, route'y decydują. Obecne route'y już to obsługują:

```ts
try { await completeMultipartUpload(...); }
catch (err) {
  // sprawdź D1 status — jeśli completed, zwróć success
  // inaczej — return 409 Conflict
}
```

**Bez zmian**. Helper NIE robi listParts samodzielnie — trusted source of truth to `parts` z request body. Helper tylko sortuje, stripuje cudzysłowy, woła binding.

### UploadPart na ten sam partNumber

Cloudflare R2 (S3 API): UploadPart na ten sam partNumber **zastępuje** poprzedni part. Jeśli retry tego samego parta padnie po rozpoczęciu, poprzednia wersja może być utracona — klient musi reuploadować. To jest zachowanie S3 protocol, nie nasz problem do rozwiązania.

### Idempotencja `abortMultipartUpload`

`R2MultipartUpload.abort()` może rzucić jeśli upload już aborted/completed. Wszystkie call-site mają `.catch(() => undefined)` — best-effort. Bez zmian.

### Concurrency

- Multiple parts upload równolegle przez Uppy — każdy ma własny presigned URL, R2 obsługuje natywnie
- Complete od jednego klienta tylko (Uppy nie wysyła parallel complete)
- D1 quota reservation atomic (D1 batch)

### R2 7-day auto-abort

R2 ma domyślną lifecycle rule wygaszającą pending multipart uploads po 7 dniach. Obecny kod ustawia `expires_at = now + 7 * 24 * 3600`. Po upływie klient dostaje 404 NoSuchUpload przy `signUploadPart`. Bez zmian.

### Retry/backoff

Po stronie **Uppy** (klient). Backend nie retry'uje. 429/5xx z R2 (presigned PUT) → Uppy backoff i retry tego samego partNumber.

### Cross-bucket bezpieczeństwo

`bindingByBucketName` rzuca dla nieznanych bucketów. Dodatkowa warstwa obrony.

## Testy

### Strategia (decyzja B + F z brainstormu)

- Nowe testy R2 binding-first, nie adaptowane mocki AWS SDK
- Miniflare R2 binding (`@cloudflare/vitest-pool-workers`, już skonfigurowany)
- Mock `globalThis.fetch` dla aws4fetch (URL inspection)
- Smoke test stagingowy ręczny, **nie w CI** — `pnpm test:smoke`

### Pliki testowe

```
apps/backend/test/
  r2-service.test.ts                     ← PRZEPISANY (Miniflare R2 binding integration)
  r2-list-parts-xml.test.ts              ← NOWY (parser XML na fixturach)
  r2-sigv4.test.ts                       ← NOWY (aws4fetch URL inspection)
  integration/multipart-mixed.smoke.ts   ← NOWY (ręczny, real R2)
  fixtures/list-parts/
    empty.xml
    single-page.xml
    truncated.xml
    with-quoted-etags.xml
    malformed.xml
    s3-error.xml
```

### Macierz pokrycia

| Helper | Mechanizm | Test cases |
|---|---|---|
| `headObject` | Miniflare R2 | (a) size dla istniejącego, (b) null dla brakującego, (c) re-throw dla innego błędu |
| `deleteObject` | Miniflare R2 | (a) usuwa istniejący, (b) idempotentne dla brakującego |
| `createMultipartUpload` | Miniflare R2 | niepusty `upload_id`, kompatybilny z `resumeMultipartUpload` |
| `completeMultipartUpload` | Miniflare R2 | (a) happy path 2 części, (b) **strip cudzysłowów ETag**, (c) sort PartNumber, (d) duplikat PartNumber → throw, (e) ETag pusty → throw, (f) PartNumber poza 1-10000 → throw, (g) **NIE wywołuje fetch/listUploadedParts** (spy + globalThis.fetch sprawdza brak wywołań aws4fetch) |
| `abortMultipartUpload` | Miniflare R2 | (a) abort działającego, (b) idempotentne |
| `listUploadedParts` | mock fetch | (a) 1 strona, (b) 2 strony przez `IsTruncated`+`NextPartNumberMarker`, (c) **hard limit 10 stron → throw**, (d) ETag z cudzysłowami zachowane, (e) non-2xx → throw z S3 error code, (f) `response.body?.cancel()` po nie-OK fetch |
| `generatePresignedPutUrl` | URL inspection | (a) `X-Amz-Algorithm=AWS4-HMAC-SHA256`, (b) `X-Amz-Expires=<expiresIn>`, (c) host `<account>.r2.cloudflarestorage.com`, (d) path-style `/<bucket>/<key>` |
| `generatePresignedGetUrl` | URL inspection | jak wyżej, method GET |
| `signUploadPart` | URL inspection | (a) `?uploadId=<id>&partNumber=<n>`, (b) **`X-Amz-SignedHeaders=host`** (nie zawiera content-type), (c) `X-Amz-Expires=900` |
| `bindingByBucketName` | unit | (a) zwraca binding dla `usrc`/`chmura-blokserwis`, (b) throw dla nieznanego |

### Smoke test stagingowy (`pnpm test:smoke`)

**Cel**: potwierdzić interop R2 binding ↔ S3 API w obu kierunkach przed deployem produkcji.

```
Path A (binding-created):
1. bucket.createMultipartUpload(key) → uploadId               [R2 BINDING]
2. signUploadPart(env, bucket, key, uploadId, 1)              [aws4fetch]
3. fetch(presignedUrl, { method: 'PUT', body: <5 MiB> })      [direct R2]
4. fetch(presignedUrl, { method: 'PUT', body: <2 MiB last> }) [part 2]
5. listUploadedParts(env, bucket, key, uploadId)              [aws4fetch + XML]
6. completeMultipartUpload(env, bucket, key, uploadId, parts) [R2 BINDING + strip]
7. headObject — verify size                                   [R2 BINDING]
8. deleteObject — cleanup                                     [R2 BINDING]

Path B (S3-created — symuluje in-flight upload z produkcji):
9. aws4fetch POST /<bucket>/<key>?uploads (S3 CreateMultipartUpload bez SDK)
10. signUploadPart + fetch PUT (jak wyżej)
11. completeMultipartUpload przez R2 binding z S3-uploadId    ← KRYTYCZNE
12. cleanup
```

Smoke test **NIE jest częścią `pnpm test`** — wymaga real R2 credentials i wytwarza realne obiekty.

### Czego NIE testować w tym PR

- E2E Uppy ↔ chmura ↔ UniSource ↔ R2 — istniejące Playwright (`pnpm test:e2e` w chmurze), odpalić ręcznie po deploy staging
- Performance regression (latencja R2 binding vs S3 API) — niepotrzebne; jeśli będzie problem, separate work

## Deploy, migracja in-flight, rollback

### Kolejność zmian (1 PR)

```
1. UniSource: services/r2.ts + r2/sigv4.ts + r2/list-parts-xml.ts
2. UniSource: testy (r2-service.test.ts od zera, r2-sigv4.test.ts, r2-list-parts-xml.test.ts, smoke)
3. UniSource: wrangler.jsonc — usunąć alias `@aws-sdk/xml-builder/...`
4. UniSource: package.json — odciąć `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
              dodać `aws4fetch`, `fast-xml-parser`
5. UniSource: pnpm install (regeneruje lock bez AWS SDK)
6. UniSource: CLAUDE.md — note o przyszłym cleanup `usrc` (sekcja "Future technical debt")
7. UniSource: pnpm typecheck && pnpm test
8. UniSource staging deploy + ręczny pnpm test:smoke
9. UniSource production deploy
10. (chmura nie wymaga zmian — proxy działa transparentnie)
11. Production smoke (real Uppy flow, mały plik 50 MiB multipart)
```

**`@aws-sdk/*` odcięte w tym samym PR** — bez tego nie ma potwierdzenia że backend nie ciągnie AWS SDK. `pnpm why @aws-sdk/client-s3` po deploycie musi być pusty.

### Pre-deploy checklist

- [ ] `pnpm typecheck` zielone
- [ ] `pnpm test` zielone (Miniflare R2 binding integration + unit)
- [ ] `pnpm test:smoke` zielone na staging (Path A i Path B)
- [ ] `wrangler deploy --dry-run --minify` — bundle size redukcja ~1-2 MB
- [ ] Workers Analytics CPU time per request porównane staging przed/po dla `/upload/r2/multipart/sign-part`

### In-flight uploads (decyzja F)

**Brak drainowania.** Cloudflare gwarantuje że `bucket.resumeMultipartUpload(key, uploadId)` akceptuje uploadId stworzony przez S3 API. Smoke test Path B potwierdza w obu kierunkach przed deployem produkcji.

**Emergency fallback** (jeśli mimo wszystko coś nie działa): `pnpm r2:abort` w chmurze (Node CLI, używa AWS SDK na hoście dev) abortuje wszystkie pending multiparts. Klienci dostają błąd przy następnym sign-part — Uppy zaczyna od nowa. To jest awaryjny tryb, nie planowane działanie.

### Rollback strategy

`wrangler rollback` cofa deployment workera w sekundach. Brak migracji D1 w tym PR — rollback to pure code revert, nie ma stanu do cofnięcia.

**Decision tree:**

- Smoke test post-deploy fails → `wrangler rollback` natychmiast
- Sporadic 5xx na sign-part w pierwszych 30 min → rollback (regresja produkcyjna)
- Stable 30 min, brak alertów → leave running, monitor 24h
- Po 24h bez incydentów → consider PR closed

### Post-deploy cleanup (po 24h stable)

W tym PR cleanup AWS SDK jest **wymagany**. Po 24h potencjalne dodatkowe porządki (jeśli się pojawią):

- (opcjonalnie) usunięcie `@xmldom/xmldom` z chmura jeśli był temporary hack — sprawdzić `chmura/src/lib/clients/r2.ts` przed deploy (`docs/plan-releases-multipart.md` o tym wspomina)
- Aktualizacja CLAUDE.md jeśli pojawiają się nowe insights

### Dependencies summary

```diff
# UniSource apps/backend/package.json
- "@aws-sdk/client-s3": "^3.1030.0",
- "@aws-sdk/s3-request-presigner": "^3.1030.0",
+ "aws4fetch": "^1.0.20",
+ "fast-xml-parser": "^4.5.0",
```

```diff
# UniSource apps/backend/wrangler.jsonc
-  "alias": {
-    "@aws-sdk/xml-builder/dist-es/xml-parser.browser": "@aws-sdk/xml-builder/dist-es/xml-parser"
-  },
```

chmura `package.json` i `pnpm-lock.yaml` — bez zmian. `chmura/scripts/abort-multipart-uploads.ts` zostaje na `@aws-sdk/client-s3` (Node CLI, DOMParser dostępny).

## Future technical debt (CLAUDE.md UniSource)

Dopisać do `apps/backend/CLAUDE.md` (lub root CLAUDE.md) sekcję:

```markdown
## Future technical debt

### Cleanup `usrc` default service (separate refactor)

Current state:
- `SERVICES['usrc']` w `src/config/services.ts`
- `USRC_BUCKET` binding w `wrangler.jsonc`
- `DEFAULT_SERVICE_ID = 'usrc'` (fallback dla anonymous service ID w auth middleware)
- `services` D1 row z `id='usrc'`

Aktywnie nie używane przez frontend (admin UI/superadmin obsługuje wyłącznie `chmura-blokserwis`).
Pozostawione jako fallback dla anonymous service ID.

Cleanup wymaga:
- audit D1 (`SELECT COUNT(*) FROM files WHERE service_id='usrc'`)
- zmiana `DEFAULT_SERVICE_ID`
- dotknięcie auth middleware (`auth.ts:130`, `:142`, `:199`)
- admin route (`admin.ts:101`, `:359`)
- wrangler.jsonc (usunąć binding `USRC_BUCKET`)
- config/services.ts

Out of scope dla R2 services migration (2026-05-15).
```

## fast-xml-parser config

```ts
import { XMLParser } from 'fast-xml-parser';

const listPartsParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,        // ETag jako string, nie liczbowy
  isArray: (name) => name === 'Part',  // wymusza tablicę nawet dla 1 części
});
```

`isArray` (NIE `isAray`) — wymusza tablicę dla `<Part>` nawet gdy w odpowiedzi jest tylko jedna część.
