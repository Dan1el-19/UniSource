# R2 services bez AWS SDK — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wymienić `@aws-sdk/client-s3` w UniSource backend (`apps/backend/src/services/r2.ts`) na hybrydę R2 binding + aws4fetch + fast-xml-parser, naprawiając produkcyjny błąd `ReferenceError: DOMParser is not defined` w runtime Cloudflare Workers — bez zmian w sygnaturach helperów (drop-in replacement).

**Architecture:** R2 binding obsługuje operacje backendowe (head/delete/multipart create/complete/abort) bez SigV4 i bez XML. aws4fetch generuje presigned URL-e dla browser direct upload i listParts. fast-xml-parser parsuje pojedynczy XML response z ListParts (recovery-only). Sygnatury wszystkich 9 helperów `r2.ts` zostają identyczne — żadna z 30+ call-site w 8 routes (`upload`, `releases`, `files`, `userFiles`, `fileRecords`, `mainStorage`, `public`, `app`) nie wymaga zmian.

**Tech Stack:** Cloudflare Workers runtime, R2 binding (`R2Bucket`), aws4fetch (~5KB SigV4 signer), fast-xml-parser (pure JS, no DOMParser), Hono, Vitest + `@cloudflare/vitest-pool-workers` (Miniflare R2).

**Spec:** `docs/superpowers/specs/2026-05-15-r2-services-no-aws-sdk-design.md`

**Constraints:** Cloudflare Workers Free plan = 10 ms CPU per request. `listUploadedParts` jest recovery-only (Uppy Golden Retriever resume); NIE może leżeć na ścieżce happy-path complete.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `apps/backend/src/services/r2.ts` | Modify (drop-in rewrite) | Public API helpers — sygnatury bez zmian, implementacja przez R2 binding + aws4fetch |
| `apps/backend/src/services/r2/sigv4.ts` | Create | aws4fetch wrapper: client factory, path-style URL builder, presign helper |
| `apps/backend/src/services/r2/list-parts-xml.ts` | Create | fast-xml-parser wrapper: `parseListPartsResponse`, `parseS3ErrorCode` |
| `apps/backend/test/r2-service.test.ts` | Rewrite from scratch | Integration tests przez Miniflare R2 binding + spy na `globalThis.fetch` dla aws4fetch |
| `apps/backend/test/r2-sigv4.test.ts` | Create | URL inspection tests dla aws4fetch wrapper |
| `apps/backend/test/r2-list-parts-xml.test.ts` | Create | Parser tests na realistycznych XML fixtures |
| `apps/backend/test/fixtures/list-parts/empty.xml` | Create | ListParts response: 0 parts |
| `apps/backend/test/fixtures/list-parts/single-part.xml` | Create | ListParts response: 1 part (weryfikuje `isArray` config) |
| `apps/backend/test/fixtures/list-parts/single-page.xml` | Create | ListParts response: 3 parts, IsTruncated=false |
| `apps/backend/test/fixtures/list-parts/truncated.xml` | Create | ListParts response: 1 part, IsTruncated=true, NextPartNumberMarker=1 |
| `apps/backend/test/fixtures/list-parts/malformed.xml` | Create | Niepoprawny XML — test failure path |
| `apps/backend/test/fixtures/list-parts/s3-error.xml` | Create | `<Error><Code>NoSuchUpload</Code></Error>` |
| `apps/backend/wrangler.jsonc` | Modify | Usunąć alias `@aws-sdk/xml-builder/...` (nie jest już potrzebny) |
| `apps/backend/package.json` | Modify | Remove `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. Add `aws4fetch`, `fast-xml-parser` |
| `apps/backend/CLAUDE.md` | Create (or modify) | Sekcja "Future technical debt" — note o przyszłym cleanup `usrc` service |

**Out of scope:** chmura-blokserwis frontend i `scripts/abort-multipart-uploads.ts` (Node CLI z DOMParser działa) — bez zmian.

---

## Tasks

### Task 1: Install new dependencies

**Files:**
- Modify: `apps/backend/package.json`
- Modify: `apps/backend/pnpm-lock.yaml` (auto-generowany przez pnpm)

W tym tasku TYLKO dodajemy nowe paczki. AWS SDK ZOSTAJE w deps do końca migracji — istniejący `services/r2.ts` musi się dalej kompilować i przechodzić istniejące testy aż do Task 4. Cleanup AWS SDK to Task 6.

- [ ] **Step 1: Add aws4fetch and fast-xml-parser**

Run:
```
pnpm --filter usrc-backend add aws4fetch@^1.0.20 fast-xml-parser@^4.5.0
```

Expected: `package.json` w `apps/backend` ma `aws4fetch` i `fast-xml-parser` w `dependencies`. `pnpm-lock.yaml` zaktualizowany.

- [ ] **Step 2: Verify install — typecheck still green**

Run:
```
pnpm --filter usrc-backend typecheck
```

Expected: PASS. Backend nadal używa AWS SDK przez `services/r2.ts`, więc nic się nie zepsuło.

- [ ] **Step 3: Commit**

```
git add apps/backend/package.json pnpm-lock.yaml
git commit -m "chore(backend): add aws4fetch and fast-xml-parser deps"
```

---

### Task 2: Implement ListParts XML parser (TDD)

**Files:**
- Create: `apps/backend/src/services/r2/list-parts-xml.ts`
- Create: `apps/backend/test/r2-list-parts-xml.test.ts`
- Create: `apps/backend/test/fixtures/list-parts/empty.xml`
- Create: `apps/backend/test/fixtures/list-parts/single-part.xml`
- Create: `apps/backend/test/fixtures/list-parts/single-page.xml`
- Create: `apps/backend/test/fixtures/list-parts/truncated.xml`
- Create: `apps/backend/test/fixtures/list-parts/malformed.xml`
- Create: `apps/backend/test/fixtures/list-parts/s3-error.xml`

- [ ] **Step 1: Create fixture — empty.xml**

`apps/backend/test/fixtures/list-parts/empty.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>0</NextPartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
</ListPartsResult>
```

- [ ] **Step 2: Create fixture — single-part.xml**

`apps/backend/test/fixtures/list-parts/single-part.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>
```

- [ ] **Step 3: Create fixture — single-page.xml**

`apps/backend/test/fixtures/list-parts/single-page.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <LastModified>2026-05-01T12:00:01.000Z</LastModified>
    <ETag>"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>3</PartNumber>
    <LastModified>2026-05-01T12:00:02.000Z</LastModified>
    <ETag>"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"</ETag>
    <Size>1048576</Size>
  </Part>
</ListPartsResult>
```

- [ ] **Step 4: Create fixture — truncated.xml**

`apps/backend/test/fixtures/list-parts/truncated.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>1</NextPartNumberMarker>
  <MaxParts>1</MaxParts>
  <IsTruncated>true</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>
```

- [ ] **Step 5: Create fixture — malformed.xml**

`apps/backend/test/fixtures/list-parts/malformed.xml`:
```
<this is not xml at all
```

- [ ] **Step 6: Create fixture — s3-error.xml**

`apps/backend/test/fixtures/list-parts/s3-error.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchUpload</Code>
  <Message>The specified multipart upload does not exist.</Message>
  <UploadId>U1</UploadId>
  <RequestId>req-1</RequestId>
  <HostId>host-1</HostId>
</Error>
```

- [ ] **Step 7: Write the failing test**

`apps/backend/test/r2-list-parts-xml.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseListPartsResponse, parseS3ErrorCode } from '../src/services/r2/list-parts-xml';

const fixtures = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/list-parts', name), 'utf8');

describe('parseListPartsResponse', () => {
  it('parses empty response', () => {
    const result = parseListPartsResponse(fixtures('empty.xml'));
    expect(result.parts).toEqual([]);
    expect(result.isTruncated).toBe(false);
    expect(result.nextPartNumberMarker).toBeUndefined();
  });

  it('parses single-part response (verifies isArray config)', () => {
    const result = parseListPartsResponse(fixtures('single-part.xml'));
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual({
      PartNumber: 1,
      ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
      Size: 5242880,
    });
    expect(result.isTruncated).toBe(false);
  });

  it('preserves quoted ETags', () => {
    const result = parseListPartsResponse(fixtures('single-page.xml'));
    expect(result.parts[0]!.ETag).toMatch(/^".+"$/);
    expect(result.parts[0]!.ETag).toBe('"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"');
  });

  it('parses single page with multiple parts', () => {
    const result = parseListPartsResponse(fixtures('single-page.xml'));
    expect(result.parts).toHaveLength(3);
    expect(result.parts.map((p) => p.PartNumber)).toEqual([1, 2, 3]);
    expect(result.isTruncated).toBe(false);
    expect(result.nextPartNumberMarker).toBeUndefined();
  });

  it('parses truncated response with NextPartNumberMarker', () => {
    const result = parseListPartsResponse(fixtures('truncated.xml'));
    expect(result.isTruncated).toBe(true);
    expect(result.nextPartNumberMarker).toBe('1');
    expect(result.parts).toHaveLength(1);
  });

  it('throws on malformed XML', () => {
    expect(() => parseListPartsResponse(fixtures('malformed.xml'))).toThrow();
  });

  it('throws on S3 error response (no <ListPartsResult>)', () => {
    expect(() => parseListPartsResponse(fixtures('s3-error.xml'))).toThrow(
      /Invalid ListParts response/
    );
  });
});

describe('parseS3ErrorCode', () => {
  it('extracts <Code> from S3 error XML', () => {
    expect(parseS3ErrorCode(fixtures('s3-error.xml'))).toBe('NoSuchUpload');
  });

  it('returns null for non-error XML', () => {
    expect(parseS3ErrorCode(fixtures('empty.xml'))).toBeNull();
  });

  it('returns null for malformed XML', () => {
    expect(parseS3ErrorCode(fixtures('malformed.xml'))).toBeNull();
  });
});
```

- [ ] **Step 8: Run test — verify it fails**

Run:
```
pnpm --filter usrc-backend test -- r2-list-parts-xml
```

Expected: FAIL — `Cannot find module '../src/services/r2/list-parts-xml'`.

- [ ] **Step 9: Implement the parser**

`apps/backend/src/services/r2/list-parts-xml.ts`:
```ts
import { XMLParser } from 'fast-xml-parser';

export interface ParsedListPartsResponse {
  isTruncated: boolean;
  nextPartNumberMarker: string | undefined;
  parts: Array<{ PartNumber: number; ETag: string; Size: number }>;
}

const listPartsParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (name) => name === 'Part',
});

const errorParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
});

interface RawPart {
  PartNumber?: string;
  ETag?: string;
  Size?: string;
}

interface RawListPartsResult {
  IsTruncated?: string;
  NextPartNumberMarker?: string;
  Part?: RawPart[];
}

export function parseListPartsResponse(xml: string): ParsedListPartsResponse {
  let parsed: { ListPartsResult?: RawListPartsResult };
  try {
    parsed = listPartsParser.parse(xml) as { ListPartsResult?: RawListPartsResult };
  } catch (err) {
    throw new Error(
      `Invalid ListParts response: XML parse failed (${(err as Error).message})`
    );
  }

  const root = parsed.ListPartsResult;
  if (!root) {
    throw new Error('Invalid ListParts response: missing <ListPartsResult>');
  }

  const isTruncated = String(root.IsTruncated ?? '').toLowerCase() === 'true';
  const nextPartNumberMarker =
    typeof root.NextPartNumberMarker === 'string' && root.NextPartNumberMarker !== '0' && root.NextPartNumberMarker !== ''
      ? root.NextPartNumberMarker
      : undefined;

  const partsRaw: RawPart[] = root.Part ?? [];
  const parts = partsRaw.map((p) => ({
    PartNumber: Number(p.PartNumber),
    ETag: typeof p.ETag === 'string' ? p.ETag : '',
    Size: Number(p.Size ?? 0),
  }));

  return { isTruncated, nextPartNumberMarker, parts };
}

export function parseS3ErrorCode(xml: string): string | null {
  try {
    const parsed = errorParser.parse(xml) as { Error?: { Code?: string } };
    const code = parsed.Error?.Code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 10: Run test — verify all pass**

Run:
```
pnpm --filter usrc-backend test -- r2-list-parts-xml
```

Expected: PASS — 10/10 tests.

- [ ] **Step 11: Commit**

```
git add apps/backend/src/services/r2/list-parts-xml.ts apps/backend/test/r2-list-parts-xml.test.ts apps/backend/test/fixtures/list-parts/
git commit -m "feat(backend): add fast-xml-parser-based ListParts response parser"
```

---

### Task 3: Implement SigV4 signing helpers (TDD)

**Files:**
- Create: `apps/backend/src/services/r2/sigv4.ts`
- Create: `apps/backend/test/r2-sigv4.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/r2-sigv4.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  createR2SigningClient,
  r2ObjectUrl,
  presign,
} from '../src/services/r2/sigv4';

const env = {
  R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'testsecret/testsecret/testsecret/testsecre',
} as unknown as CloudflareBindings;

describe('r2ObjectUrl', () => {
  it('builds path-style URL for bucket+key', () => {
    expect(r2ObjectUrl(env, 'unisource', 'releases/v1.0.0.zip')).toBe(
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/unisource/releases/v1.0.0.zip'
    );
  });

  it('encodes special characters in key segments but preserves /', () => {
    expect(r2ObjectUrl(env, 'unisource', 'my folder/file (1).pdf')).toBe(
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/unisource/my%20folder/file%20(1).pdf'
    );
  });
});

describe('presign GET', () => {
  it('produces SigV4 query-style URL with X-Amz-* params', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'file.bin');
    const signed = await presign(client, base, 'GET', 900);
    const u = new URL(signed);
    expect(u.host).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/unisource/file.bin');
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AKIATESTKEY');
  });
});

describe('presign PUT (single-shot upload)', () => {
  it('produces signed URL with custom expiresIn', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'upload.bin');
    const signed = await presign(client, base, 'PUT', 3600);
    const u = new URL(signed);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});

describe('presign PUT for UploadPart', () => {
  it('preserves uploadId+partNumber and adds SigV4 query params', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'big.bin');
    const url = `${base}?uploadId=ABC123&partNumber=7`;
    const signed = await presign(client, url, 'PUT', 900);
    const u = new URL(signed);
    expect(u.searchParams.get('uploadId')).toBe('ABC123');
    expect(u.searchParams.get('partNumber')).toBe('7');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs only host (does NOT sign Content-Type)', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'big.bin');
    const signed = await presign(client, `${base}?uploadId=X&partNumber=1`, 'PUT', 900);
    const u = new URL(signed);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).not.toContain('content-type');
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run:
```
pnpm --filter usrc-backend test -- r2-sigv4
```

Expected: FAIL — `Cannot find module '../src/services/r2/sigv4'`.

- [ ] **Step 3: Implement the sigv4 wrapper**

`apps/backend/src/services/r2/sigv4.ts`:
```ts
import { AwsClient } from 'aws4fetch';

export function createR2SigningClient(env: CloudflareBindings): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

/**
 * Build a path-style R2 object URL.
 * Each `/`-separated segment is URI-encoded; the slashes are preserved.
 */
export function r2ObjectUrl(env: CloudflareBindings, bucket: string, key: string): string {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://${host}/${encodeURIComponent(bucket)}/${path}`;
}

/**
 * Sign a URL with SigV4 query-string mode (presigned URL).
 * Caller passes any extra query params in `url`; this function adds X-Amz-Expires
 * before signing so they are included in the canonical request.
 *
 * `allHeaders: false` ensures only `host` is signed — Content-Type from the
 * actual PUT request will NOT need to match the signature.
 */
export async function presign(
  client: AwsClient,
  url: string,
  method: 'GET' | 'PUT',
  expiresInSeconds: number
): Promise<string> {
  const u = new URL(url);
  u.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(u.toString(), {
    method,
    aws: { signQuery: true, allHeaders: false },
  });
  return signed.url;
}
```

- [ ] **Step 4: Run test — verify all pass**

Run:
```
pnpm --filter usrc-backend test -- r2-sigv4
```

Expected: PASS — 6/6 tests. If `signed.url` returns a `URL` object instead of string, replace `return signed.url` with `return signed.url.toString()`.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/services/r2/sigv4.ts apps/backend/test/r2-sigv4.test.ts
git commit -m "feat(backend): add aws4fetch-based SigV4 helpers for R2 presigning"
```

---

### Task 4: Rewrite services/r2.ts (drop-in replacement)

**Files:**
- Modify: `apps/backend/src/services/r2.ts` (full rewrite, public sygnatury bez zmian)

This task is one large rewrite. The existing file is ~280 lines using AWS SDK; the new file uses R2 binding + the helpers from Task 2 and Task 3. Public exports (`headObject`, `deleteObject`, `generatePresignedPutUrl`, `generatePresignedGetUrl`, `createMultipartUpload`, `signUploadPart`, `listUploadedParts`, `completeMultipartUpload`, `abortMultipartUpload`) and types (`R2ObjectMeta`, `MultipartCreateResult`, `MultipartSignPartResult`, `MultipartUploadedPart`, `MultipartPartInput`, `MultipartCompleteResult`, `PresignedUploadResult`, `PresignedDownloadResult`) zachowane bytewise.

Po tym tasku istniejący `test/r2-service.test.ts` (z `vi.mock('@aws-sdk/client-s3')`) **prawdopodobnie zacznie failować** — mocki dotyczą modułu, którego helpery już nie używają. To OK; przepiszemy test w Task 5. Tu czasowo tolerujemy red w tym pliku.

- [ ] **Step 1: Replace the whole file content**

`apps/backend/src/services/r2.ts`:
```ts
import { SERVICES } from '../config/services';
import {
  createR2SigningClient,
  r2ObjectUrl,
  presign,
} from './r2/sigv4';
import { parseListPartsResponse, parseS3ErrorCode } from './r2/list-parts-xml';

export interface PresignedUploadResult {
  presigned_url: string;
  storage_key: string;
  expires_at: number;
}

export interface PresignedDownloadResult {
  presigned_url: string;
  storage_key: string;
  expires_at: number;
}

export interface R2ObjectMeta {
  size: number;
}

export interface MultipartCreateResult {
  upload_id: string;
}

export interface MultipartSignPartResult {
  url: string;
  expires_at: number;
}

export interface MultipartUploadedPart {
  PartNumber: number;
  ETag: string;
  Size: number;
}

export interface MultipartPartInput {
  PartNumber: number;
  ETag: string;
}

export interface MultipartCompleteResult {
  etag: string | null;
}

const LIST_PARTS_MAX_PAGES = 10;

/**
 * Resolve the R2Bucket binding for a given bucket name by walking the
 * SERVICES map. Throws if the bucket is unknown or the binding is not
 * configured in the worker — defence-in-depth against accidental
 * cross-bucket access.
 */
function bindingByBucketName(env: CloudflareBindings, bucketName: string): R2Bucket {
  for (const svc of Object.values(SERVICES)) {
    if (svc.bucketName === bucketName) {
      const binding = (env as unknown as Record<string, R2Bucket | undefined>)[svc.bucketEnvKey];
      if (!binding) {
        throw new Error(`R2 binding not configured: ${svc.bucketEnvKey}`);
      }
      return binding;
    }
  }
  throw new Error(`Unknown R2 bucket: ${bucketName} (not in SERVICES map)`);
}

// ─── Object operations (R2 binding) ───────────────────────────────────────────

export async function headObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<R2ObjectMeta | null> {
  const obj = await bindingByBucketName(env, bucket).head(key);
  return obj ? { size: obj.size } : null;
}

export async function deleteObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<void> {
  await bindingByBucketName(env, bucket).delete(key);
}

// ─── Presigned URLs (aws4fetch SigV4) ─────────────────────────────────────────

export async function generatePresignedPutUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  _contentType: string,
  expiresInSeconds = 3600
): Promise<PresignedUploadResult> {
  // Content-Type intentionally NOT signed — clients send their own at PUT time.
  // SignedHeaders=host only.
  const client = createR2SigningClient(env);
  const presigned_url = await presign(client, r2ObjectUrl(env, bucket, key), 'PUT', expiresInSeconds);
  return {
    presigned_url,
    storage_key: key,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

export async function generatePresignedGetUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  expiresInSeconds = 900
): Promise<PresignedDownloadResult> {
  const client = createR2SigningClient(env);
  const presigned_url = await presign(client, r2ObjectUrl(env, bucket, key), 'GET', expiresInSeconds);
  return {
    presigned_url,
    storage_key: key,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

// ─── Multipart Upload ─────────────────────────────────────────────────────────

export async function createMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  contentType: string
): Promise<MultipartCreateResult> {
  const mpu = await bindingByBucketName(env, bucket).createMultipartUpload(key, {
    httpMetadata: { contentType },
  });
  return { upload_id: mpu.uploadId };
}

export async function signUploadPart(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 900
): Promise<MultipartSignPartResult> {
  const client = createR2SigningClient(env);
  const baseUrl = r2ObjectUrl(env, bucket, key);
  const partUrl = `${baseUrl}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
  const url = await presign(client, partUrl, 'PUT', expiresInSeconds);
  return {
    url,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

/**
 * Recovery-only. Used by Uppy Golden Retriever resume after browser crash.
 * Each page costs ~5–10 ms CPU on Workers Free plan — keep off the happy path.
 *
 * Hard cap: LIST_PARTS_MAX_PAGES (10). Over the cap → throw; client falls
 * back to fresh upload.
 */
export async function listUploadedParts(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<MultipartUploadedPart[]> {
  const client = createR2SigningClient(env);
  const baseUrl = r2ObjectUrl(env, bucket, key);
  const parts: MultipartUploadedPart[] = [];
  let partNumberMarker: string | undefined = undefined;

  for (let page = 0; page < LIST_PARTS_MAX_PAGES; page++) {
    const u = new URL(baseUrl);
    u.searchParams.set('uploadId', uploadId);
    u.searchParams.set('max-parts', '1000');
    if (partNumberMarker) u.searchParams.set('part-number-marker', partNumberMarker);

    const response = await client.fetch(u.toString(), { method: 'GET' });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const code = parseS3ErrorCode(body);
      // Free up the resp body if not consumed — Cloudflare best practice.
      response.body?.cancel().catch(() => undefined);
      throw new Error(`ListParts failed: ${response.status}${code ? ' ' + code : ''}`);
    }

    const xml = await response.text();
    const parsed = parseListPartsResponse(xml);
    for (const p of parsed.parts) {
      parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size });
    }
    if (!parsed.isTruncated || !parsed.nextPartNumberMarker) break;
    partNumberMarker = parsed.nextPartNumberMarker;
    if (page === LIST_PARTS_MAX_PAGES - 1) {
      throw new Error(
        `listUploadedParts exceeded max iterations (${LIST_PARTS_MAX_PAGES} pages × 1000 parts)`
      );
    }
  }

  return parts;
}

export async function completeMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  parts: MultipartPartInput[]
): Promise<MultipartCompleteResult> {
  validatePartsForComplete(parts);

  const ordered = parts
    .slice()
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map((p) => ({
      partNumber: p.PartNumber,
      etag: p.ETag.replace(/^"|"$/g, ''),
    }));

  const mpu = bindingByBucketName(env, bucket).resumeMultipartUpload(key, uploadId);
  const obj = await mpu.complete(ordered);
  return { etag: obj.httpEtag ?? null };
}

export async function abortMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<void> {
  const mpu = bindingByBucketName(env, bucket).resumeMultipartUpload(key, uploadId);
  await mpu.abort();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validatePartsForComplete(parts: MultipartPartInput[]): void {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('completeMultipartUpload: parts must be a non-empty array');
  }
  const seen = new Set<number>();
  for (const p of parts) {
    if (!Number.isInteger(p.PartNumber) || p.PartNumber < 1 || p.PartNumber > 10000) {
      throw new Error(`completeMultipartUpload: PartNumber out of range (1..10000): ${p.PartNumber}`);
    }
    if (seen.has(p.PartNumber)) {
      throw new Error(`completeMultipartUpload: duplicate PartNumber ${p.PartNumber}`);
    }
    seen.add(p.PartNumber);
    if (typeof p.ETag !== 'string' || p.ETag.length === 0) {
      throw new Error(`completeMultipartUpload: empty ETag for PartNumber ${p.PartNumber}`);
    }
  }
}
```

- [ ] **Step 2: Run typecheck**

Run:
```
pnpm --filter usrc-backend typecheck
```

Expected: PASS. AWS SDK still in `package.json` so old test compiles, but new `services/r2.ts` no longer imports it.

If typecheck fails on `signed.url` (TypeScript inferring incorrectly), replace `return signed.url` in `sigv4.ts` with `return signed.url.toString()`.

- [ ] **Step 3: Run full test suite (expect r2-service.test.ts to fail)**

Run:
```
pnpm --filter usrc-backend test
```

Expected: All tests except `r2-service.test.ts` PASS. `r2-service.test.ts` will fail because it mocks `@aws-sdk/client-s3` but `headObject` no longer uses it. This is expected — Task 5 rewrites that test.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/services/r2.ts
git commit -m "refactor(backend): rewrite r2.ts with R2 binding + aws4fetch (no AWS SDK)"
```

---

### Task 5: Rewrite test/r2-service.test.ts (binding-first)

**Files:**
- Modify: `apps/backend/test/r2-service.test.ts` (rewrite from scratch)

The new test imports `env` from `cloudflare:test` (Miniflare R2 binding) for object operations, and stubs `globalThis.fetch` for aws4fetch-based helpers. No AWS SDK mocks.

- [ ] **Step 1: Replace test file content**

`apps/backend/test/r2-service.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  headObject,
  deleteObject,
  createMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  signUploadPart,
  listUploadedParts,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
} from '../src/services/r2';

// USRC_BUCKET is provisioned by wrangler.jsonc; vitest-pool-workers exposes it
// as a Miniflare R2 binding. We use the matching SERVICES map id.
const BUCKET = 'unisource';

const fixtures = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/list-parts', name), 'utf8');

async function clearBucket() {
  const list = await env.USRC_BUCKET.list();
  for (const obj of list.objects) {
    await env.USRC_BUCKET.delete(obj.key);
  }
}

describe('headObject (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('returns size for existing object', async () => {
    await env.USRC_BUCKET.put('hello.txt', 'hello world');
    const result = await headObject(env, BUCKET, 'hello.txt');
    expect(result).toEqual({ size: 11 });
  });

  it('returns null for missing object (NO throw)', async () => {
    const result = await headObject(env, BUCKET, 'does-not-exist.bin');
    expect(result).toBeNull();
  });

  it('throws for unknown bucket name', async () => {
    await expect(headObject(env, 'no-such-bucket', 'x')).rejects.toThrow(/Unknown R2 bucket/);
  });
});

describe('deleteObject (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('removes existing object', async () => {
    await env.USRC_BUCKET.put('to-delete.txt', 'bye');
    await deleteObject(env, BUCKET, 'to-delete.txt');
    expect(await env.USRC_BUCKET.head('to-delete.txt')).toBeNull();
  });

  it('is idempotent for missing object', async () => {
    await expect(deleteObject(env, BUCKET, 'never-existed.txt')).resolves.toBeUndefined();
  });
});

describe('createMultipartUpload + abortMultipartUpload (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('returns non-empty upload_id and is abortable', async () => {
    const { upload_id } = await createMultipartUpload(env, BUCKET, 'big.bin', 'application/octet-stream');
    expect(upload_id).toBeTruthy();
    await expect(abortMultipartUpload(env, BUCKET, 'big.bin', upload_id)).resolves.toBeUndefined();
  });
});

describe('completeMultipartUpload (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('strips quoted ETags and writes a real object (happy path, 2 parts)', async () => {
    const { upload_id } = await createMultipartUpload(env, BUCKET, 'merged.bin', 'application/octet-stream');
    const mpu = env.USRC_BUCKET.resumeMultipartUpload('merged.bin', upload_id);
    const partA = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0xaa));
    const partB = await mpu.uploadPart(2, new Uint8Array(1024).fill(0xbb));

    const result = await completeMultipartUpload(env, BUCKET, 'merged.bin', upload_id, [
      { PartNumber: 1, ETag: `"${partA.etag}"` },
      { PartNumber: 2, ETag: `"${partB.etag}"` },
    ]);

    expect(result.etag).toBeTruthy();
    const head = await env.USRC_BUCKET.head('merged.bin');
    expect(head).not.toBeNull();
    expect(head!.size).toBe(5 * 1024 * 1024 + 1024);
  });

  it('sorts unordered parts by PartNumber before complete', async () => {
    const { upload_id } = await createMultipartUpload(env, BUCKET, 'sorted.bin', 'application/octet-stream');
    const mpu = env.USRC_BUCKET.resumeMultipartUpload('sorted.bin', upload_id);
    const p1 = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0x11));
    const p2 = await mpu.uploadPart(2, new Uint8Array(1024).fill(0x22));

    await expect(
      completeMultipartUpload(env, BUCKET, 'sorted.bin', upload_id, [
        { PartNumber: 2, ETag: p2.etag },
        { PartNumber: 1, ETag: p1.etag },
      ])
    ).resolves.toBeTruthy();
  });

  it('throws on empty parts', async () => {
    await expect(completeMultipartUpload(env, BUCKET, 'x.bin', 'fake-upload', [])).rejects.toThrow(
      /non-empty array/
    );
  });

  it('throws on duplicate PartNumber', async () => {
    await expect(
      completeMultipartUpload(env, BUCKET, 'x.bin', 'fake-upload', [
        { PartNumber: 1, ETag: 'a' },
        { PartNumber: 1, ETag: 'b' },
      ])
    ).rejects.toThrow(/duplicate PartNumber/);
  });

  it('throws on PartNumber out of range', async () => {
    await expect(
      completeMultipartUpload(env, BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 0, ETag: 'a' }])
    ).rejects.toThrow(/out of range/);
    await expect(
      completeMultipartUpload(env, BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 10001, ETag: 'a' }])
    ).rejects.toThrow(/out of range/);
  });

  it('throws on empty ETag', async () => {
    await expect(
      completeMultipartUpload(env, BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 1, ETag: '' }])
    ).rejects.toThrow(/empty ETag/);
  });

  it('does NOT call globalThis.fetch (no aws4fetch on happy path)', async () => {
    const { upload_id } = await createMultipartUpload(env, BUCKET, 'no-fetch.bin', 'application/octet-stream');
    const mpu = env.USRC_BUCKET.resumeMultipartUpload('no-fetch.bin', upload_id);
    const part = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0x33));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await completeMultipartUpload(env, BUCKET, 'no-fetch.bin', upload_id, [
        { PartNumber: 1, ETag: part.etag },
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('listUploadedParts (mocked fetch)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses single page and returns parts (with quoted ETags)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures('single-page.xml'), { status: 200, headers: { 'content-type': 'application/xml' } })
    ) as unknown as typeof globalThis.fetch;

    const parts = await listUploadedParts(env, BUCKET, 'k', 'U1');
    expect(parts).toHaveLength(3);
    expect(parts[0]!.ETag).toMatch(/^".+"$/);
  });

  it('paginates through 2 pages via NextPartNumberMarker', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(calls === 1 ? fixtures('truncated.xml') : fixtures('single-part.xml'), {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;

    const parts = await listUploadedParts(env, BUCKET, 'k', 'U1');
    expect(calls).toBe(2);
    expect(parts).toHaveLength(2);
  });

  it('throws after 10 pages', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures('truncated.xml'), { status: 200 })
    ) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(env, BUCKET, 'k', 'U1')).rejects.toThrow(/exceeded max iterations/);
  });

  it('throws with S3 error code on non-OK fetch', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures('s3-error.xml'), { status: 404 })
    ) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(env, BUCKET, 'k', 'U1')).rejects.toThrow(/404 NoSuchUpload/);
  });

  it('cancels response body on non-OK fetch', async () => {
    const cancel = vi.fn(async () => undefined);
    const fakeResponse = {
      ok: false,
      status: 404,
      text: async () => fixtures('s3-error.xml'),
      body: { cancel },
    } as unknown as Response;
    globalThis.fetch = vi.fn(async () => fakeResponse) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(env, BUCKET, 'k', 'U1')).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('generatePresignedPutUrl / generatePresignedGetUrl', () => {
  it('returns SigV4 query-style URL with X-Amz-* params (PUT, default 3600s)', async () => {
    const result = await generatePresignedPutUrl(env, BUCKET, 'foo.bin', 'application/octet-stream');
    const u = new URL(result.presigned_url);
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(result.storage_key).toBe('foo.bin');
  });

  it('returns SigV4 query-style URL with custom expiresIn (GET, 900s)', async () => {
    const result = await generatePresignedGetUrl(env, BUCKET, 'foo.bin', 900);
    const u = new URL(result.presigned_url);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});

describe('signUploadPart', () => {
  it('preserves uploadId+partNumber in query and signs only host', async () => {
    const result = await signUploadPart(env, BUCKET, 'big.bin', 'ABC123', 7, 900);
    const u = new URL(result.url);
    expect(u.searchParams.get('uploadId')).toBe('ABC123');
    expect(u.searchParams.get('partNumber')).toBe('7');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});
```

- [ ] **Step 2: Run the test — verify all pass**

Run:
```
pnpm --filter usrc-backend test -- r2-service
```

Expected: PASS — all groups green. If `vi.spyOn(globalThis, 'fetch')` throws "cannot redefine property", the implementation may need `globalThis.fetch = ...` instead — adjust the test setup accordingly.

- [ ] **Step 3: Run the full test suite**

Run:
```
pnpm --filter usrc-backend test
```

Expected: PASS. Other tests (`releases-routes.test.ts`, `upload-hardening.test.ts`) mock `services/r2` directly with `vi.mock`, so they're unaffected by internal r2.ts changes.

- [ ] **Step 4: Commit**

```
git add apps/backend/test/r2-service.test.ts
git commit -m "test(backend): rewrite r2-service tests for R2 binding + aws4fetch"
```

---

### Task 6: Cleanup wrangler alias + remove AWS SDK from deps

**Files:**
- Modify: `apps/backend/wrangler.jsonc` (remove `alias` block)
- Modify: `apps/backend/package.json` (remove `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- Modify: `apps/backend/pnpm-lock.yaml` (auto-regenerated)

**Why in the same PR as the migration:** without this, we cannot prove the worker bundle is free of AWS SDK. `pnpm why @aws-sdk/client-s3` after this task must be empty.

- [ ] **Step 1: Remove wrangler alias**

Edit `apps/backend/wrangler.jsonc` — delete the `alias` block:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "unisource",
  "account_id": "0435db96c4078cd58f12162e0b83cee0",
  "main": "src/index.ts",
  "compatibility_date": "2026-05-11",
  "compatibility_flags": ["nodejs_compat"],
  // alias block removed — was a hack for @aws-sdk/xml-builder browser/node mismatch.
  "observability": { ... },
  ...
}
```

The diff:
```diff
   "compatibility_flags": ["nodejs_compat"],
-  "alias": {
-    "@aws-sdk/xml-builder/dist-es/xml-parser.browser": "@aws-sdk/xml-builder/dist-es/xml-parser"
-  },
   "observability": {
```

- [ ] **Step 2: Remove AWS SDK from package.json**

Run:
```
pnpm --filter usrc-backend remove @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: `apps/backend/package.json` no longer lists `@aws-sdk/*`. `pnpm-lock.yaml` regenerated.

- [ ] **Step 3: Verify AWS SDK is fully removed from the lockfile**

Run:
```
pnpm --filter usrc-backend why @aws-sdk/client-s3
```

Expected: empty output (no consumers).

Run:
```
pnpm --filter usrc-backend why @aws-sdk/s3-request-presigner
```

Expected: empty output.

- [ ] **Step 4: Typecheck + tests**

Run:
```
pnpm --filter usrc-backend typecheck
pnpm --filter usrc-backend test
```

Expected: both PASS.

- [ ] **Step 5: Verify bundle builds cleanly**

Run:
```
pnpm --filter usrc-backend build
```

Expected: PASS. Bundle size should drop ~1–2 MB compared to the pre-migration build (informational).

- [ ] **Step 6: Commit**

```
git add apps/backend/package.json apps/backend/wrangler.jsonc pnpm-lock.yaml
git commit -m "chore(backend): drop @aws-sdk/client-s3 and xml-builder alias"
```

---

### Task 7: Add CLAUDE.md note about future usrc cleanup

**Files:**
- Create or modify: `apps/backend/CLAUDE.md`

`apps/backend/CLAUDE.md` does not currently exist (only the root `UniSource/CLAUDE.md`). Create a backend-scoped CLAUDE.md to capture this debt.

- [ ] **Step 1: Create the file**

`apps/backend/CLAUDE.md`:
```markdown
# Backend (Hono on Cloudflare Workers)

## Future technical debt

### Cleanup `usrc` default service (separate refactor)

Current state:
- `SERVICES['usrc']` in `src/config/services.ts`
- `USRC_BUCKET` binding in `wrangler.jsonc`
- `DEFAULT_SERVICE_ID = 'usrc'` (fallback for anonymous service ID in auth middleware)
- `services` D1 row with `id='usrc'`

Not actively used by the frontend (admin UI / superadmin handles only `chmura-blokserwis`).
Kept as a fallback for anonymous service ID resolution.

Cleanup requires:
- audit D1 (`SELECT COUNT(*) FROM files WHERE service_id='usrc'`)
- change `DEFAULT_SERVICE_ID`
- touch auth middleware (`auth.ts:130`, `:142`, `:199`)
- admin route (`admin.ts:101`, `:359`)
- wrangler.jsonc (remove `USRC_BUCKET` binding)
- config/services.ts

Out of scope for the R2 services migration (2026-05-15, see
`docs/superpowers/specs/2026-05-15-r2-services-no-aws-sdk-design.md`).
```

- [ ] **Step 2: Commit**

```
git add apps/backend/CLAUDE.md
git commit -m "docs(backend): note future usrc default service cleanup"
```

---

### Task 8: Final typecheck + full test run

**Files:** None (verification only).

- [ ] **Step 1: Clean install to ensure lockfile is consistent**

Run:
```
pnpm install --frozen-lockfile
```

Expected: PASS. No "lockfile out of sync" errors.

- [ ] **Step 2: Typecheck**

Run:
```
pnpm --filter usrc-backend typecheck
```

Expected: PASS.

- [ ] **Step 3: Full test suite**

Run:
```
pnpm --filter usrc-backend test
```

Expected: PASS — all suites green, including `r2-service.test.ts`, `r2-sigv4.test.ts`, `r2-list-parts-xml.test.ts`, `releases-routes.test.ts`, `upload-hardening.test.ts`.

- [ ] **Step 4: Build dry-run**

Run:
```
pnpm --filter usrc-backend build
```

Expected: PASS. Note the bundle size for comparison post-deploy.

- [ ] **Step 5: Verify imports — no @aws-sdk left in source**

Run (Grep tool, NOT bash):
```
Grep pattern="@aws-sdk" path="apps/backend/src" output_mode="files_with_matches"
```

Expected: empty result (no matches in source).

```
Grep pattern="@aws-sdk" path="apps/backend/test" output_mode="files_with_matches"
```

Expected: empty result.

- [ ] **Step 6: No commit — this task is verification only**

If everything green, proceed to Task 9. If anything red, fix in place before continuing.

---

### Task 9: Manual staging smoke test

**Files:** None (manual procedure).

This task is a **manual checkpoint** that runs against the deployed staging worker. CI cannot execute this — it requires real R2 credentials and creates real R2 objects. The procedure is the spec's "Path A + Path B" smoke test (`docs/superpowers/specs/2026-05-15-r2-services-no-aws-sdk-design.md` § Smoke test stagingowy).

- [ ] **Step 1: Deploy to staging**

Run:
```
pnpm --filter usrc-backend deploy --env staging
```

Expected: Worker deployed. Note the deployment URL.

If there is no `staging` environment configured in `wrangler.jsonc`, deploy to a temporary preview URL via:
```
pnpm --filter usrc-backend wrangler deploy --dry-run=false --name unisource-smoke
```

(The deploy target is the operator's choice; document whichever was used.)

- [ ] **Step 2: Run Path A — binding-created multipart**

Using a small Node script or `curl`-driven sequence (operator's preference), execute:

1. POST `/upload/r2/multipart/create` with auth → record `r2_upload_id`, `key`
2. GET `/upload/r2/multipart/sign-part?upload_id=…&part_number=1` → presigned URL
3. PUT 5 MiB to the presigned URL → record returned `ETag`
4. GET `/upload/r2/multipart/sign-part?upload_id=…&part_number=2`
5. PUT 1 KiB → record `ETag`
6. (Optional) GET `/upload/r2/multipart/list-parts?upload_id=…` → verify 2 parts returned with quoted ETags
7. POST `/upload/r2/multipart/complete` with body `{ upload_id, parts: [{PartNumber, ETag}, ...] }`
8. Verify response `{ success: true, status: 'completed' }`
9. Verify the file is accessible via `/files/<id>/download` (returns 302 to presigned GET URL)

Expected: all 9 steps green.

- [ ] **Step 3: Run Path B — S3-created multipart, finalised by binding**

This step is the in-flight migration scenario: an upload started against the OLD AWS-SDK-backed worker must be completable by the NEW worker. Since the OLD worker no longer exists by this point, simulate by initiating a multipart via aws4fetch directly:

```
# pseudocode — operator may use any tool
1. Use aws4fetch (Node script) to POST /<bucket>/<key>?uploads (S3 CreateMultipartUpload)
2. Parse XML response, extract <UploadId>
3. Call our /upload/r2/multipart/sign-part with that UploadId  → presigned URL (works only if D1 record exists; alternatively skip the D1-coupled endpoints and use aws4fetch presign helper directly)
4. PUT one part of 5 MiB; record ETag
5. Call our /upload/r2/multipart/complete with {upload_id, parts}
6. Verify success (R2 binding accepts the S3-created uploadId)
```

Expected: success. If complete returns 409, the binding interop assumption is broken — STOP, do NOT deploy production. Document the failure and discard this PR.

- [ ] **Step 4: Cleanup**

Delete the staging artefacts (test files in R2 + D1 rows). The cleanup script can be ad-hoc — operator chooses (Wrangler CLI `r2 object delete`, D1 `DELETE FROM files WHERE id LIKE 'smoke-%'`).

- [ ] **Step 5: Pre-deploy checklist (from spec § Pre-deploy checklist)**

Verify before proceeding to Task 10:
- [ ] Path A green
- [ ] Path B green (binding accepts S3-API-created uploadId)
- [ ] No errors in `wrangler tail` output during smoke
- [ ] Bundle size reduction confirmed (compare `pnpm build` output to a pre-migration baseline)

If any item red → block production deploy and investigate.

---

### Task 10: Production deploy + monitoring

**Files:** None (operational task).

- [ ] **Step 1: Open PR for review (if not already)**

Run:
```
gh pr create --title "feat(backend): replace AWS SDK with R2 binding + aws4fetch (DOMParser fix)" --body "$(cat <<'EOF'
## Summary
- Drop-in rewrite of \`apps/backend/src/services/r2.ts\` — R2 binding for backend ops, aws4fetch for presigning, fast-xml-parser for ListParts.
- Fixes prod \`ReferenceError: DOMParser is not defined\` on multipart endpoints.
- Removes \`@aws-sdk/client-s3\` and \`@aws-sdk/s3-request-presigner\` from backend deps in the same PR.
- Public sygnatury helperów bez zmian — żadna z 30+ call-site nie wymaga zmian.
- Spec: docs/superpowers/specs/2026-05-15-r2-services-no-aws-sdk-design.md
- Plan: docs/superpowers/plans/2026-05-15-r2-services-no-aws-sdk.md

## Test plan
- [x] Vitest pass (Miniflare R2 binding integration + aws4fetch URL inspection + XML parser fixtures)
- [x] Staging smoke Path A (binding-created multipart): create → sign → PUT → list → complete → head → delete
- [x] Staging smoke Path B (S3-API-created multipart, finalised via binding) — confirms in-flight interop
- [ ] Production smoke (small 50 MiB multipart via real Uppy)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

- [ ] **Step 2: After PR approval — deploy to production**

Run:
```
pnpm --filter usrc-backend deploy
```

Expected: PASS. Worker version published.

- [ ] **Step 3: Production smoke (small real upload)**

In `chmura-blokserwis` UI:
1. Upload a ~50 MiB file via the standard multipart flow.
2. Verify the upload completes (no 500 from `/api/upload/r2/multipart/create` or `/complete`).
3. Verify the file appears in the file list.
4. Verify download works.

Expected: full flow green. If any step fails:
```
wrangler --filter usrc-backend rollback
```
And open an incident issue with logs.

- [ ] **Step 4: Watch logs for 30 minutes**

In another terminal:
```
pnpm --filter usrc-backend wrangler tail --format=pretty
```

Filter signals to watch for:
- `ReferenceError: DOMParser` → SHOULD never appear post-deploy
- `ListParts failed: 4xx` → expected only on Golden Retriever resume of stale uploads
- `R2 binding not configured` → BUG, rollback
- 5xx spike on `/upload/r2/multipart/*` or `/releases/upload/multipart/*` → rollback

Decision tree (from spec § Rollback strategy):
- Smoke test fails post-deploy → `wrangler rollback` immediately
- Sporadic 5xx on sign-part in first 30 min → rollback (production regression)
- Stable 30 min, no alerts → leave running, monitor 24h
- 24h clean → close PR, mark resolved

- [ ] **Step 5: Mark plan complete**

After 24h of stable production, the migration is done. No further action — `usrc` cleanup is tracked in `apps/backend/CLAUDE.md` as future debt.

---

## Self-Review Notes

This plan was self-reviewed against the spec on 2026-05-15:

- **Spec coverage:** every section of the spec maps to at least one task — Mapowanie helperów → Task 4; Wewnętrzny lookup bindingu (`bindingByBucketName`) → Task 4 step 1; Free plan constraints (recovery-only `listUploadedParts`, hard cap 10 pages) → Task 4 + Task 5; ETag strip → Task 4 + Task 5; Walidacja parts → Task 4 + Task 5; aws4fetch SignedHeaders=host (no Content-Type) → Task 3 + Task 5; XML parser config (`isArray`, `parseTagValue: false`) → Task 2; smoke test Path A/B → Task 9; AWS SDK removal in same PR → Task 6; CLAUDE.md note → Task 7.
- **Placeholder scan:** no TBDs, no "implement later", no skipped code blocks. Operational steps in Task 9 (smoke test scripting) intentionally leave the operator to choose tooling — this is operationally appropriate, not a placeholder.
- **Type consistency:** helper sygnatury i nazwy wszystkich pól typed structures (`MultipartCreateResult.upload_id`, `MultipartSignPartResult.{url, expires_at}`, `MultipartUploadedPart.{PartNumber, ETag, Size}`, `MultipartPartInput.{PartNumber, ETag}`, `MultipartCompleteResult.etag`, `R2ObjectMeta.size`, `PresignedUploadResult.{presigned_url, storage_key, expires_at}`) — used identycznie w Task 4 (impl), Task 5 (testy) i są zgodne z istniejącym kontraktem konsumentów (Task 4 nie zmienia żadnego call-site w `routes/`).
