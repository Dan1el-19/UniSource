# Share Links + Admin UI + Luki Spójności — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodanie systemu publicznych linków do plików, panelu admina oraz zamknięcie luk spójności (restore folderu z kosza, Admin UI).

**Architecture:** D1 `share_links` table + Hono `/public/:slug` (no-auth) + authenticated CRUD under `/my-files` and `/share-links`. Frontend: SvelteKit route `/s/[slug]` outside `(app)` layout group, ShareLinksModal w DriveBrowser, AdminPanel page.

**Tech Stack:** Hono 4, Cloudflare Workers, D1 (SQLite), Web Crypto PBKDF2, SvelteKit 2 + Svelte 5, @unisource/sdk (Zod 4), Lucide Svelte

---

## File Map

**Create:**
- `apps/backend/src/db/migrations/0007_share_links.sql`
- `apps/backend/src/utils/password.ts`
- `apps/backend/src/utils/slug.ts`
- `apps/backend/src/db/shareLinks.ts`
- `apps/backend/src/routes/shareLinks.ts`
- `apps/backend/src/routes/public.ts`
- `packages/unisource-sdk/src/shareLinks.ts`
- `apps/frontend/src/routes/s/[slug]/+page.server.ts`
- `apps/frontend/src/routes/s/[slug]/+page.svelte`
- `apps/frontend/src/routes/(app)/admin/+page.svelte`
- `apps/frontend/src/components/files/ShareLinksModal.svelte`

**Modify:**
- `apps/backend/src/index.ts` — rejestracja nowych routerów
- `apps/backend/src/routes/fileRecords.ts` — POST/GET share-links, cascade deactivate on delete
- `apps/backend/src/db/services.ts` — rozszerzenie action enum o `share_link_accessed`
- `apps/backend/src/routes/admin.ts` — aktualizacja audit enum w validatorze
- `packages/unisource-sdk/src/services.ts` — audit action enum
- `packages/unisource-sdk/src/client.ts` — namespace shareLinks
- `packages/unisource-sdk/src/index.ts` — eksporty shareLinks
- `apps/frontend/src/lib/api.ts` — funkcje publiczne (getPublicFileInfo, unlockPublicFile)
- `apps/frontend/src/hooks.server.ts` — dodanie `/admin` do protected
- `apps/frontend/src/components/layout/Sidebar.svelte` — link Admin
- `apps/frontend/src/components/layout/BottomDock.svelte` — brak zmian (max 4, Shared zostaje)
- `apps/frontend/src/components/files/ContextMenu.svelte` — akcja 'share'
- `apps/frontend/src/components/files/DriveBrowser.svelte` — obsługa 'share', ShareLinksModal
- `apps/frontend/src/components/files/TrashBrowser.svelte` — foldery w koszu + restore

---

## Task 1: Migracja D1 — tabela share_links

**Files:**
- Create: `apps/backend/src/db/migrations/0007_share_links.sql`

- [ ] **Utwórz plik migracji**

```sql
-- Share links: multiple public download links per file
-- slug is globally unique (custom or auto-generated)
-- password_hash uses PBKDF2: stored as "salt_hex:hash_hex"
CREATE TABLE share_links (
  id              TEXT PRIMARY KEY,
  service_id      TEXT NOT NULL,
  file_id         TEXT NOT NULL,
  user_id         TEXT NOT NULL,

  slug            TEXT NOT NULL UNIQUE,
  name            TEXT,

  password_hash   TEXT,
  expires_at      INTEGER,

  download_count  INTEGER NOT NULL DEFAULT 0,
  max_downloads   INTEGER,

  is_active       INTEGER NOT NULL DEFAULT 1,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_share_links_slug    ON share_links(slug);
CREATE INDEX idx_share_links_file_id ON share_links(file_id, service_id);
CREATE INDEX idx_share_links_user_id ON share_links(user_id, service_id);
```

- [ ] **Zastosuj migrację lokalnie**

```bash
pnpm --filter backend exec wrangler d1 migrations apply usrc-d1 --local
```

Oczekiwane: `✅ Applied 1 migration`

- [ ] **Commit**

```bash
git add apps/backend/src/db/migrations/0007_share_links.sql
git commit -m "feat(backend): add share_links D1 migration"
```

---

## Task 2: Utility — hashowanie haseł (PBKDF2)

**Files:**
- Create: `apps/backend/src/utils/password.ts`

- [ ] **Utwórz plik**

```typescript
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;

async function importKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
}

async function derive(key: CryptoKey, salt: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await importKey(password);
  const hash = await derive(key, salt);
  return `${toHex(salt.buffer)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const key = await importKey(password);
  const hash = await derive(key, salt);
  return toHex(hash) === hashHex;
}
```

- [ ] **Commit**

```bash
git add apps/backend/src/utils/password.ts
git commit -m "feat(backend): add PBKDF2 password utility"
```

---

## Task 3: Utility — generowanie slugów

**Files:**
- Create: `apps/backend/src/utils/slug.ts`

- [ ] **Utwórz plik**

```typescript
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SLUG_LENGTH = 10;

export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH));
  return Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join('');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{3,64}$/.test(slug);
}
```

- [ ] **Commit**

```bash
git add apps/backend/src/utils/slug.ts
git commit -m "feat(backend): add slug generator utility"
```

---

## Task 4: DB layer — share_links CRUD

**Files:**
- Create: `apps/backend/src/db/shareLinks.ts`

- [ ] **Utwórz plik**

```typescript
import type { D1Database } from '@cloudflare/workers-types';

export interface ShareLink {
  id: string;
  service_id: string;
  file_id: string;
  user_id: string;
  slug: string;
  name: string | null;
  password_hash: string | null;
  expires_at: number | null;
  download_count: number;
  max_downloads: number | null;
  is_active: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface CreateShareLinkInput {
  id: string;
  service_id: string;
  file_id: string;
  user_id: string;
  slug: string;
  name?: string | null;
  password_hash?: string | null;
  expires_at?: number | null;
  max_downloads?: number | null;
}

export interface UpdateShareLinkInput {
  name?: string | null;
  is_active?: 0 | 1;
  password_hash?: string | null;
  expires_at?: number | null;
  max_downloads?: number | null;
}

export async function createShareLink(
  db: D1Database,
  input: CreateShareLinkInput
): Promise<ShareLink> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO share_links
         (id, service_id, file_id, user_id, slug, name, password_hash, expires_at,
          download_count, max_downloads, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`
    )
    .bind(
      input.id,
      input.service_id,
      input.file_id,
      input.user_id,
      input.slug,
      input.name ?? null,
      input.password_hash ?? null,
      input.expires_at ?? null,
      input.max_downloads ?? null,
      now,
      now
    )
    .run();
  return getShareLinkById(db, input.id) as Promise<ShareLink>;
}

export async function getShareLinkById(
  db: D1Database,
  id: string
): Promise<ShareLink | null> {
  const result = await db
    .prepare('SELECT * FROM share_links WHERE id = ?')
    .bind(id)
    .first<ShareLink>();
  return result ?? null;
}

export async function getShareLinkBySlug(
  db: D1Database,
  slug: string
): Promise<ShareLink | null> {
  const result = await db
    .prepare('SELECT * FROM share_links WHERE slug = ?')
    .bind(slug)
    .first<ShareLink>();
  return result ?? null;
}

export async function listShareLinksForFile(
  db: D1Database,
  fileId: string,
  userId: string,
  serviceId: string
): Promise<ShareLink[]> {
  const result = await db
    .prepare(
      'SELECT * FROM share_links WHERE file_id = ? AND user_id = ? AND service_id = ? ORDER BY created_at DESC'
    )
    .bind(fileId, userId, serviceId)
    .all<ShareLink>();
  return result.results ?? [];
}

export async function updateShareLink(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string,
  updates: UpdateShareLinkInput
): Promise<ShareLink | null> {
  const now = Math.floor(Date.now() / 1000);
  const setClauses: string[] = ['updated_at = ?'];
  const binds: (string | number | null)[] = [now];

  if (updates.name !== undefined) { setClauses.push('name = ?'); binds.push(updates.name); }
  if (updates.is_active !== undefined) { setClauses.push('is_active = ?'); binds.push(updates.is_active); }
  if (updates.password_hash !== undefined) { setClauses.push('password_hash = ?'); binds.push(updates.password_hash); }
  if (updates.expires_at !== undefined) { setClauses.push('expires_at = ?'); binds.push(updates.expires_at); }
  if (updates.max_downloads !== undefined) { setClauses.push('max_downloads = ?'); binds.push(updates.max_downloads); }

  const result = await db
    .prepare(
      `UPDATE share_links SET ${setClauses.join(', ')}
       WHERE id = ? AND user_id = ? AND service_id = ?`
    )
    .bind(...binds, id, userId, serviceId)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getShareLinkById(db, id);
}

export async function deleteShareLink(
  db: D1Database,
  id: string,
  userId: string,
  serviceId: string
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM share_links WHERE id = ? AND user_id = ? AND service_id = ?')
    .bind(id, userId, serviceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deactivateShareLinksForFile(
  db: D1Database,
  fileId: string,
  serviceId: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      'UPDATE share_links SET is_active = 0, updated_at = ? WHERE file_id = ? AND service_id = ?'
    )
    .bind(now, fileId, serviceId)
    .run();
}

export async function incrementDownloadCount(
  db: D1Database,
  id: string
): Promise<void> {
  await db
    .prepare('UPDATE share_links SET download_count = download_count + 1 WHERE id = ?')
    .bind(id)
    .run();
}
```

- [ ] **Commit**

```bash
git add apps/backend/src/db/shareLinks.ts
git commit -m "feat(backend): add share_links DB layer"
```

---

## Task 5: SDK — typy shareLinks + rozszerzenie audit action

**Files:**
- Create: `packages/unisource-sdk/src/shareLinks.ts`
- Modify: `packages/unisource-sdk/src/services.ts`
- Modify: `packages/unisource-sdk/src/index.ts`

- [ ] **Utwórz `shareLinks.ts` w SDK**

```typescript
import { z } from 'zod';
import { nonEmptyString, positiveInt, unixTimestamp } from './primitives';

export const shareLinkSchema = z.object({
  id: nonEmptyString,
  service_id: nonEmptyString,
  file_id: nonEmptyString,
  user_id: nonEmptyString,
  slug: nonEmptyString,
  name: z.string().nullable(),
  has_password: z.boolean(),
  expires_at: unixTimestamp.nullable(),
  download_count: z.number().int().nonnegative(),
  max_downloads: positiveInt.nullable(),
  is_active: z.boolean(),
  created_at: unixTimestamp,
  updated_at: unixTimestamp,
});
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const shareLinkCreateRequestSchema = z.object({
  slug: z.string().trim().min(3).max(64).optional(),
  name: z.string().trim().max(128).optional(),
  password: z.string().min(1).optional(),
  expires_at: unixTimestamp.optional(),
  max_downloads: positiveInt.optional(),
});
export type ShareLinkCreateRequest = z.infer<typeof shareLinkCreateRequestSchema>;

export const shareLinkUpdateRequestSchema = z.object({
  name: z.string().trim().max(128).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).nullable().optional(),
  expires_at: unixTimestamp.nullable().optional(),
  max_downloads: positiveInt.nullable().optional(),
});
export type ShareLinkUpdateRequest = z.infer<typeof shareLinkUpdateRequestSchema>;

export const shareLinkListResponseSchema = z.object({
  items: z.array(shareLinkSchema),
});
export type ShareLinkListResponse = z.infer<typeof shareLinkListResponseSchema>;

export const shareLinkCreateResponseSchema = z.object({
  link: shareLinkSchema,
});
export type ShareLinkCreateResponse = z.infer<typeof shareLinkCreateResponseSchema>;

export const shareLinkUpdateResponseSchema = z.object({
  link: shareLinkSchema,
});
export type ShareLinkUpdateResponse = z.infer<typeof shareLinkUpdateResponseSchema>;

// Public access — returned when link has no password OR after unlock
export const publicFileAccessResponseSchema = z.object({
  file_id: nonEmptyString,
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(false),
  download_url: z.string().url(),
  url_expires_at: unixTimestamp,
  link_name: z.string().nullable(),
  link_expires_at: unixTimestamp.nullable(),
});
export type PublicFileAccessResponse = z.infer<typeof publicFileAccessResponseSchema>;

// Public access — returned when link requires password
export const publicFileLockedResponseSchema = z.object({
  filename: nonEmptyString,
  size: positiveInt,
  mime_type: nonEmptyString,
  requires_password: z.literal(true),
  link_name: z.string().nullable(),
});
export type PublicFileLockedResponse = z.infer<typeof publicFileLockedResponseSchema>;
```

- [ ] **Rozszerz `auditEventActionSchema` w `services.ts`**

W pliku `packages/unisource-sdk/src/services.ts` zmień linię z enum:

```typescript
export const auditEventActionSchema = z.enum([
  'upload_completed',
  'file_deleted',
  'folder_deleted',
  'quota_exceeded',
  'share_link_accessed',
]);
```

- [ ] **Dodaj eksporty w `index.ts`**

Na końcu pliku `packages/unisource-sdk/src/index.ts` dodaj:

```typescript
// ─── Share Links ──────────────────────────────────────────────────────────────
export {
  shareLinkSchema,
  shareLinkCreateRequestSchema,
  shareLinkUpdateRequestSchema,
  shareLinkListResponseSchema,
  shareLinkCreateResponseSchema,
  shareLinkUpdateResponseSchema,
  publicFileAccessResponseSchema,
  publicFileLockedResponseSchema,
} from './shareLinks';
export type {
  ShareLink,
  ShareLinkCreateRequest,
  ShareLinkUpdateRequest,
  ShareLinkListResponse,
  ShareLinkCreateResponse,
  ShareLinkUpdateResponse,
  PublicFileAccessResponse,
  PublicFileLockedResponse,
} from './shareLinks';
```

- [ ] **Commit**

```bash
git add packages/unisource-sdk/src/shareLinks.ts packages/unisource-sdk/src/services.ts packages/unisource-sdk/src/index.ts
git commit -m "feat(sdk): add shareLinks types and public access schemas"
```

---

## Task 6: SDK — namespace shareLinks w kliencie

**Files:**
- Modify: `packages/unisource-sdk/src/client.ts`

- [ ] **Dodaj import types i namespace w klasie `UnisourceClient`**

Na górze pliku po istniejących importach dodaj:

```typescript
import type {
  ShareLinkCreateRequest,
  ShareLinkCreateResponse,
  ShareLinkListResponse,
  ShareLinkUpdateRequest,
  ShareLinkUpdateResponse,
} from './shareLinks';
```

Na końcu klasy `UnisourceClient`, po bloku `admin`, dodaj:

```typescript
  // ─── Share Links ──────────────────────────────────────────────────────────────

  readonly shareLinks = {
    /** Create a public share link for a file */
    create: (fileId: string, body: ShareLinkCreateRequest, signal?: AbortSignal): Promise<ShareLinkCreateResponse> =>
      apiRequest(this.config, 'POST', `/my-files/${fileId}/share-links`, { body, signal }),

    /** List all share links for a file */
    list: (fileId: string, signal?: AbortSignal): Promise<ShareLinkListResponse> =>
      apiRequest(this.config, 'GET', `/my-files/${fileId}/share-links`, { signal }),

    /** Update a share link (rename, toggle, change password/expiry) */
    update: (linkId: string, body: ShareLinkUpdateRequest, signal?: AbortSignal): Promise<ShareLinkUpdateResponse> =>
      apiRequest(this.config, 'PATCH', `/share-links/${linkId}`, { body, signal }),

    /** Permanently delete a share link */
    delete: (linkId: string, signal?: AbortSignal): Promise<{ success: true; id: string }> =>
      apiRequest(this.config, 'DELETE', `/share-links/${linkId}`, { signal }),
  };
```

- [ ] **Commit**

```bash
git add packages/unisource-sdk/src/client.ts
git commit -m "feat(sdk): add shareLinks namespace to UnisourceClient"
```

---

## Task 7: Backend — routes/shareLinks.ts (CRUD autentykowany)

**Files:**
- Create: `apps/backend/src/routes/shareLinks.ts`

- [ ] **Utwórz plik**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createShareLink,
  listShareLinksForFile,
  updateShareLink,
  deleteShareLink,
  type ShareLink,
} from '../db/shareLinks';
import { getFileRecordForUser } from '../db/fileRecords';
import { hashPassword } from '../utils/password';
import { generateSlug, isValidSlug } from '../utils/slug';
import type {
  ShareLinkCreateResponse,
  ShareLinkListResponse,
  ShareLinkUpdateResponse,
} from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return c.json({ error: 'Bad Request', message: `${path}${issue?.message ?? 'Validation failed'}` }, 400);
}

function mapShareLink(link: ShareLink) {
  return {
    id: link.id,
    service_id: link.service_id,
    file_id: link.file_id,
    user_id: link.user_id,
    slug: link.slug,
    name: link.name,
    has_password: link.password_hash !== null,
    expires_at: link.expires_at,
    download_count: link.download_count,
    max_downloads: link.max_downloads,
    is_active: link.is_active === 1,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };
}

const createBodySchema = z.object({
  slug: z.string().trim().min(3).max(64).optional(),
  name: z.string().trim().max(128).optional(),
  password: z.string().min(1).optional(),
  expires_at: z.number().int().positive().optional(),
  max_downloads: z.number().int().positive().optional(),
});

const updateBodySchema = z.object({
  name: z.string().trim().max(128).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).nullable().optional(),
  expires_at: z.number().int().positive().nullable().optional(),
  max_downloads: z.number().int().positive().nullable().optional(),
});

const fileIdParam = z.object({ fileId: z.string().trim().min(1) });
const linkIdParam = z.object({ linkId: z.string().trim().min(1) });

const shareLinkRouter = new Hono<HonoEnv>();

// POST /my-files/:fileId/share-links
shareLinkRouter.post(
  '/my-files/:fileId/share-links',
  zValidator('param', fileIdParam, validationErrorHook),
  zValidator('json', createBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');
    const body = c.req.valid('json');

    const file = await getFileRecordForUser(c.env.usrc_d1, fileId, userId, serviceId);
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);
    if (file.is_trashed) return c.json({ error: 'Conflict', message: 'Cannot share a trashed file' }, 409);

    let slug = body.slug;
    if (slug) {
      if (!isValidSlug(slug)) {
        return c.json({ error: 'Bad Request', message: 'slug must be 3–64 alphanumeric/dash/underscore chars' }, 400);
      }
    } else {
      // Generate unique slug with retry
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSlug();
        const existing = await c.env.usrc_d1
          .prepare('SELECT id FROM share_links WHERE slug = ?')
          .bind(candidate)
          .first();
        if (!existing) { slug = candidate; break; }
      }
      if (!slug) return c.json({ error: 'Internal Server Error', message: 'Could not generate unique slug' }, 500);
    }

    const password_hash = body.password ? await hashPassword(body.password) : null;
    const id = crypto.randomUUID();

    const link = await createShareLink(c.env.usrc_d1, {
      id,
      service_id: serviceId,
      file_id: fileId,
      user_id: userId,
      slug,
      name: body.name ?? null,
      password_hash,
      expires_at: body.expires_at ?? null,
      max_downloads: body.max_downloads ?? null,
    });

    return c.json<ShareLinkCreateResponse>({ link: mapShareLink(link) }, 201);
  }
);

// GET /my-files/:fileId/share-links
shareLinkRouter.get(
  '/my-files/:fileId/share-links',
  zValidator('param', fileIdParam, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');

    const file = await getFileRecordForUser(c.env.usrc_d1, fileId, userId, serviceId);
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);

    const links = await listShareLinksForFile(c.env.usrc_d1, fileId, userId, serviceId);
    return c.json<ShareLinkListResponse>({ items: links.map(mapShareLink) });
  }
);

// PATCH /share-links/:linkId
shareLinkRouter.patch(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, validationErrorHook),
  zValidator('json', updateBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');
    const body = c.req.valid('json');

    const updates: Parameters<typeof updateShareLink>[3] = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;
    if (body.expires_at !== undefined) updates.expires_at = body.expires_at;
    if (body.max_downloads !== undefined) updates.max_downloads = body.max_downloads;
    if (body.password !== undefined) {
      updates.password_hash = body.password !== null ? await hashPassword(body.password) : null;
    }

    const link = await updateShareLink(c.env.usrc_d1, linkId, userId, serviceId, updates);
    if (!link) return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);

    return c.json<ShareLinkUpdateResponse>({ link: mapShareLink(link) });
  }
);

// DELETE /share-links/:linkId
shareLinkRouter.delete(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');

    const deleted = await deleteShareLink(c.env.usrc_d1, linkId, userId, serviceId);
    if (!deleted) return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);

    return c.json({ success: true, id: linkId });
  }
);

export default shareLinkRouter;
```

- [ ] **Commit**

```bash
git add apps/backend/src/routes/shareLinks.ts
git commit -m "feat(backend): add share links CRUD routes"
```

---

## Task 8: Backend — routes/public.ts (dostęp publiczny)

**Files:**
- Create: `apps/backend/src/routes/public.ts`

- [ ] **Utwórz plik**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getShareLinkBySlug, incrementDownloadCount } from '../db/shareLinks';
import { getFileRecord } from '../db/fileRecords';
import { logServiceEvent } from '../db/services';
import { verifyPassword } from '../utils/password';
import { generatePresignedGetUrl } from '../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import { getServiceConfig } from '../config/services';

type HonoEnv = { Bindings: CloudflareBindings };

const DOWNLOAD_URL_TTL = 15 * 60;

const slugParam = z.object({ slug: z.string().trim().min(1) });

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  return c.json({ error: 'Bad Request', message: issue?.message ?? 'Validation failed' }, 400);
}

async function generateDownloadUrl(
  env: CloudflareBindings,
  serviceId: string,
  storageDestination: string,
  storageKey: string,
  bucket: string
): Promise<{ download_url: string; url_expires_at: number }> {
  if (storageDestination === 'r2') {
    const svcConfig = getServiceConfig(serviceId)!;
    const { presigned_url, expires_at } = await generatePresignedGetUrl(
      env,
      svcConfig.bucketName,
      storageKey,
      DOWNLOAD_URL_TTL
    );
    return { download_url: presigned_url, url_expires_at: expires_at };
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(storageKey);
  if (!appwriteFileId) throw new Error('Invalid Appwrite storage key');

  const token = await createAppwriteFileToken(env, bucket, appwriteFileId, DOWNLOAD_URL_TTL);
  const downloadUrl = buildAppwriteFileDownloadUrl(env, bucket, appwriteFileId, token.secret);
  return { download_url: downloadUrl, url_expires_at: token.expires_at };
}

const publicRouter = new Hono<HonoEnv>();

publicRouter.get('/:slug', zValidator('param', slugParam, validationErrorHook), async (c) => {
  const { slug } = c.req.valid('param');
  const now = Math.floor(Date.now() / 1000);

  const link = await getShareLinkBySlug(c.env.usrc_d1, slug);
  if (!link || !link.is_active) {
    return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
  }
  if (link.expires_at && link.expires_at < now) {
    return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
  }
  if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
    return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
  }

  const file = await getFileRecord(c.env.usrc_d1, link.file_id);
  if (!file || file.is_trashed) {
    return c.json({ error: 'Not Found', message: 'File not available' }, 404);
  }

  if (link.password_hash) {
    return c.json({
      filename: file.filename,
      size: file.size,
      mime_type: file.mime_type,
      requires_password: true,
      link_name: link.name,
    });
  }

  try {
    const { download_url, url_expires_at } = await generateDownloadUrl(
      c.env,
      link.service_id,
      file.storage_destination,
      file.storage_key,
      file.bucket
    );

    c.executionCtx.waitUntil(
      Promise.all([
        incrementDownloadCount(c.env.usrc_d1, link.id),
        logServiceEvent(c.env.usrc_d1, {
          serviceId: link.service_id,
          userId: link.user_id,
          action: 'share_link_accessed',
          resourceType: 'file',
          resourceId: link.file_id,
          metadata: { slug, link_id: link.id },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        }),
      ])
    );

    c.header('Cache-Control', 'no-store');
    return c.json({
      file_id: file.id,
      filename: file.filename,
      size: file.size,
      mime_type: file.mime_type,
      requires_password: false,
      download_url,
      url_expires_at,
      link_name: link.name,
      link_expires_at: link.expires_at,
    });
  } catch {
    return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
  }
});

publicRouter.post(
  '/:slug/unlock',
  zValidator('param', slugParam, validationErrorHook),
  zValidator('json', z.object({ password: z.string().min(1) }), validationErrorHook),
  async (c) => {
    const { slug } = c.req.valid('param');
    const { password } = c.req.valid('json');
    const now = Math.floor(Date.now() / 1000);

    const link = await getShareLinkBySlug(c.env.usrc_d1, slug);
    if (!link || !link.is_active) {
      return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
    }
    if (link.expires_at && link.expires_at < now) {
      return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
    }
    if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
      return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
    }
    if (!link.password_hash) {
      return c.json({ error: 'Bad Request', message: 'This link has no password' }, 400);
    }

    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) return c.json({ error: 'Unauthorized', message: 'Incorrect password' }, 401);

    const file = await getFileRecord(c.env.usrc_d1, link.file_id);
    if (!file || file.is_trashed) {
      return c.json({ error: 'Not Found', message: 'File not available' }, 404);
    }

    try {
      const { download_url, url_expires_at } = await generateDownloadUrl(
        c.env,
        link.service_id,
        file.storage_destination,
        file.storage_key,
        file.bucket
      );

      c.executionCtx.waitUntil(
        Promise.all([
          incrementDownloadCount(c.env.usrc_d1, link.id),
          logServiceEvent(c.env.usrc_d1, {
            serviceId: link.service_id,
            userId: link.user_id,
            action: 'share_link_accessed',
            resourceType: 'file',
            resourceId: link.file_id,
            metadata: { slug, link_id: link.id },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          }),
        ])
      );

      c.header('Cache-Control', 'no-store');
      return c.json({
        file_id: file.id,
        filename: file.filename,
        size: file.size,
        mime_type: file.mime_type,
        requires_password: false,
        download_url,
        url_expires_at,
        link_name: link.name,
        link_expires_at: link.expires_at,
      });
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
    }
  }
);

export default publicRouter;
```

- [ ] **Commit**

```bash
git add apps/backend/src/routes/public.ts
git commit -m "feat(backend): add public share link access routes"
```

---

## Task 9: Backend — aktualizacja index.ts + audit enum + cascade delete

**Files:**
- Modify: `apps/backend/src/index.ts`
- Modify: `apps/backend/src/db/services.ts`
- Modify: `apps/backend/src/routes/admin.ts`
- Modify: `apps/backend/src/routes/fileRecords.ts`

- [ ] **Zaktualizuj `index.ts` — zarejestruj nowe routery**

```typescript
import shareLinkRouter from './routes/shareLinks';
import publicRouter from './routes/public';
```

Po bloku `app.route('/admin', admin);` dodaj:

```typescript
// Share link CRUD — JWT only (user must own the file)
app.use('/my-files/:fileId/share-links*', authMiddleware);
app.route('/', shareLinkRouter);

app.use('/share-links/*', authMiddleware);
app.route('/', shareLinkRouter);

// Public share access — no auth required
app.route('/public', publicRouter);
```

- [ ] **Zaktualizuj typ akcji w `db/services.ts`**

W `AuditEventRow` zmień typ `action`:

```typescript
action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed';
```

W `LogEventInput` zmień typ `action`:

```typescript
action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed';
```

- [ ] **Zaktualizuj enum w `routes/admin.ts`**

W `auditLogQuerySchema` zmień enum:

```typescript
action: z
  .enum(['upload_completed', 'file_deleted', 'folder_deleted', 'quota_exceeded', 'share_link_accessed'])
  .optional(),
```

- [ ] **Dodaj cascade deactivate w `routes/fileRecords.ts`**

W funkcji `DELETE /:id` (permanent delete), przed `deleteFileRecordPermanently(...)`, dodaj:

```typescript
import { deactivateShareLinksForFile } from '../db/shareLinks';

// ... w handlerze, po usunięciu z storage, przed deleteFileRecordPermanently:
await deactivateShareLinksForFile(c.env.usrc_d1, id, serviceId);
```

- [ ] **Sprawdź typecheck backendu**

```bash
pnpm --filter backend typecheck
```

Oczekiwane: `0 errors`

- [ ] **Commit**

```bash
git add apps/backend/src/index.ts apps/backend/src/db/services.ts apps/backend/src/routes/admin.ts apps/backend/src/routes/fileRecords.ts
git commit -m "feat(backend): wire share link routes, extend audit enum, cascade deactivate on delete"
```

---

## Task 10: Frontend — publiczne helper functions w lib/api.ts

**Files:**
- Modify: `apps/frontend/src/lib/api.ts`

- [ ] **Dodaj dwie funkcje na końcu pliku**

```typescript
const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export async function getPublicFileInfo(slug: string): Promise<unknown> {
  const res = await fetch(`${PUBLIC_API_URL}/public/${encodeURIComponent(slug)}`, {
    headers: { 'Cache-Control': 'no-store' },
  });
  return res.json();
}

export async function unlockPublicFile(slug: string, password: string): Promise<unknown> {
  const res = await fetch(`${PUBLIC_API_URL}/public/${encodeURIComponent(slug)}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ password }),
  });
  return res.json();
}
```

- [ ] **Commit**

```bash
git add apps/frontend/src/lib/api.ts
git commit -m "feat(frontend): add public share link API helpers"
```

---

## Task 11: Frontend — publiczna strona /s/[slug]

**Files:**
- Create: `apps/frontend/src/routes/s/[slug]/+page.server.ts`
- Create: `apps/frontend/src/routes/s/[slug]/+page.svelte`

- [ ] **Utwórz `+page.server.ts`**

```typescript
import type { PageServerLoad } from './$types';

const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:8787';

export const load: PageServerLoad = async ({ params }) => {
  const { slug } = params;

  try {
    const res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}`);
    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      return { slug, status: res.status, error: (data as any).message ?? 'Link not found', data: null };
    }

    return { slug, status: res.status, error: null, data };
  } catch {
    return { slug, status: 503, error: 'Service unavailable', data: null };
  }
};
```

- [ ] **Utwórz `+page.svelte`**

```svelte
<script lang="ts">
  import { Lock, Download, FileText, AlertTriangle, Eye, EyeOff } from 'lucide-svelte';
  import { unlockPublicFile } from '$lib/api';

  let { data } = $props<{ data: {
    slug: string;
    status: number;
    error: string | null;
    data: Record<string, unknown> | null;
  }}>();

  let fileInfo = $state(data.data);
  let passwordInput = $state('');
  let showPassword = $state(false);
  let isUnlocking = $state(false);
  let unlockError = $state<string | null>(null);
  let isDownloading = $state(false);

  const isGone = $derived(data.status === 410);
  const isNotFound = $derived(data.status === 404 || (!fileInfo && !!data.error));
  const requiresPassword = $derived(fileInfo?.requires_password === true);
  const hasAccess = $derived(fileInfo?.requires_password === false);

  function formatBytes(bytes: number) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  async function handleUnlock() {
    if (!passwordInput.trim()) return;
    isUnlocking = true;
    unlockError = null;
    try {
      const result = await unlockPublicFile(data.slug, passwordInput) as any;
      if (result.requires_password === false) {
        fileInfo = result;
        passwordInput = '';
      } else {
        unlockError = result.message ?? 'Nieprawidłowe hasło';
      }
    } catch {
      unlockError = 'Błąd sieci. Spróbuj ponownie.';
    } finally {
      isUnlocking = false;
    }
  }

  async function handleDownload() {
    if (!fileInfo?.download_url) return;
    isDownloading = true;
    try {
      const anchor = document.createElement('a');
      anchor.href = fileInfo.download_url as string;
      anchor.download = fileInfo.filename as string;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => { isDownloading = false; }, 1500);
    }
  }
</script>

<svelte:head>
  <title>
    {#if fileInfo?.filename}{fileInfo.filename as string} — UniSource{:else}UniSource Share{/if}
  </title>
</svelte:head>

<div class="public-wrap">
  <div class="public-card glass">
    {#if isNotFound || isGone}
      <div class="state-icon warn"><AlertTriangle size={36} /></div>
      <h1 class="card-title">{isGone ? 'Link wygasł' : 'Nie znaleziono'}</h1>
      <p class="card-sub">{data.error ?? 'Ten link nie istnieje lub został dezaktywowany.'}</p>

    {:else if requiresPassword}
      <div class="state-icon lock"><Lock size={36} /></div>
      <h1 class="card-title">{fileInfo?.filename as string}</h1>
      {#if fileInfo?.link_name}
        <p class="link-name">„{fileInfo.link_name}"</p>
      {/if}
      <p class="card-sub">{formatBytes(fileInfo?.size as number)} · chronione hasłem</p>

      <form class="password-form" onsubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
        <div class="input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Wpisz hasło"
            bind:value={passwordInput}
            class="password-input {unlockError ? 'is-error' : ''}"
            autocomplete="current-password"
          />
          <button
            type="button"
            class="show-toggle"
            onclick={() => { showPassword = !showPassword; }}
            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {#if showPassword}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
          </button>
        </div>
        {#if unlockError}
          <p class="error-msg" role="alert">{unlockError}</p>
        {/if}
        <button type="submit" class="btn-primary" disabled={isUnlocking || !passwordInput.trim()}>
          {isUnlocking ? 'Sprawdzam…' : 'Odblokuj'}
        </button>
      </form>

    {:else if hasAccess}
      <div class="state-icon file"><FileText size={36} /></div>
      <h1 class="card-title">{fileInfo?.filename as string}</h1>
      {#if fileInfo?.link_name}
        <p class="link-name">„{fileInfo.link_name}"</p>
      {/if}
      <p class="card-sub">{formatBytes(fileInfo?.size as number)}</p>

      <button class="btn-primary" onclick={handleDownload} disabled={isDownloading}>
        <Download size={18} />
        {isDownloading ? 'Pobieranie…' : 'Pobierz plik'}
      </button>
    {/if}

    <p class="powered">Udostępniono przez <strong>UniSource</strong></p>
  </div>
</div>

<style>
  .public-wrap {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background: var(--color-bg-base);
  }

  .public-card {
    width: min(460px, 100%);
    border-radius: var(--radius-xl);
    border-color: var(--color-glass-border);
    padding: var(--space-8) var(--space-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
    box-shadow: 0 40px 80px color-mix(in oklab, #000 40%, transparent);
  }

  .state-icon {
    width: 72px;
    height: 72px;
    border-radius: var(--radius-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2);
  }
  .state-icon.file { background: color-mix(in oklab, var(--color-info) 14%, transparent); color: var(--color-info); }
  .state-icon.lock { background: color-mix(in oklab, var(--color-warning) 14%, transparent); color: var(--color-warning); }
  .state-icon.warn { background: color-mix(in oklab, var(--color-danger) 14%, transparent); color: var(--color-danger); }

  .card-title {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
    word-break: break-word;
  }

  .link-name {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-style: italic;
    margin-top: calc(-1 * var(--space-2));
  }

  .card-sub {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .password-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .input-wrap {
    position: relative;
  }

  .password-input {
    width: 100%;
    height: 44px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    padding: 0 44px 0 var(--space-3);
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-in-out),
                box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .password-input:focus {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 0 3px var(--color-accent-muted);
  }

  .password-input.is-error {
    border-color: color-mix(in oklab, var(--color-danger) 60%, transparent);
  }

  .show-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    padding: 4px;
    border-radius: var(--radius-sm);
  }

  .show-toggle:hover { color: var(--color-text-primary); }

  .error-msg {
    font-size: var(--text-xs);
    color: var(--color-danger);
    text-align: left;
  }

  .btn-primary {
    margin-top: var(--space-2);
    width: 100%;
    height: 48px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-default);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-size: var(--text-sm);
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-in-out),
                transform var(--duration-instant) var(--ease-spring);
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:active:not(:disabled) { transform: scale(0.98); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .powered {
    margin-top: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .powered strong { color: var(--color-text-secondary); font-weight: 500; }
</style>
```

- [ ] **Commit**

```bash
git add apps/frontend/src/routes/s/
git commit -m "feat(frontend): add public share link page /s/[slug]"
```

---

## Task 12: Frontend — Sidebar: link Admin + hooks.server.ts

**Files:**
- Modify: `apps/frontend/src/components/layout/Sidebar.svelte`
- Modify: `apps/frontend/src/hooks.server.ts`

- [ ] **Zaktualizuj `Sidebar.svelte`**

Dodaj `ShieldCheck` do importu Lucide oraz element `admin` w `navItems`:

```typescript
import {
  ChevronLeft,
  ChevronRight,
  HardDrive,
  LogOut,
  Settings,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-svelte';
```

```typescript
const navItems = [
  { id: 'drive',    label: 'Mój dysk',     href: '/drive',    icon: HardDrive },
  { id: 'shared',   label: 'Udostępnione', href: '/shared',   icon: Share2 },
  { id: 'trash',    label: 'Kosz',         href: '/trash',    icon: Trash2 },
  { id: 'admin',    label: 'Admin',        href: '/admin',    icon: ShieldCheck },
  { id: 'settings', label: 'Ustawienia',   href: '/settings', icon: Settings },
] as const;
```

Zaktualizuj `activeTab` derived:

```typescript
const activeTab = $derived.by(() => {
  const path = page.url.pathname;
  if (path.startsWith('/shared'))   return 'shared';
  if (path.startsWith('/trash'))    return 'trash';
  if (path.startsWith('/settings')) return 'settings';
  if (path.startsWith('/admin'))    return 'admin';
  return 'drive';
});
```

- [ ] **Zaktualizuj `hooks.server.ts` — dodaj `/admin` do protected**

```typescript
const protectedPrefixes = ['/drive', '/settings', '/shared', '/trash', '/search', '/admin'];
```

- [ ] **Commit**

```bash
git add apps/frontend/src/components/layout/Sidebar.svelte apps/frontend/src/hooks.server.ts
git commit -m "feat(frontend): add Admin nav link to sidebar"
```

---

## Task 13: Frontend — Admin panel /admin

**Files:**
- Create: `apps/frontend/src/routes/(app)/admin/+page.svelte`

- [ ] **Utwórz stronę admina**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { LoaderCircle, ShieldCheck, HardDrive, Activity, Upload } from 'lucide-svelte';
  import type { ServiceDetailResponse, ServiceUsageResponse, AuditLogListResponse, UploadsListResponse } from '@unisource/sdk';
  import { apiClient } from '$lib/api';
  import { authState } from '../../state/auth.svelte';

  let sessionReady = $state(false);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

  let service = $state<ServiceDetailResponse['service'] | null>(null);
  let usage = $state<ServiceUsageResponse | null>(null);
  let auditLog = $state<AuditLogListResponse['items']>([]);
  let uploads = $state<UploadsListResponse['items']>([]);

  function formatBytes(bytes: number) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  const usageColor = $derived.by(() => {
    if (!usage) return 'var(--color-success)';
    if (usage.used_percent > 85) return 'var(--color-danger)';
    if (usage.used_percent > 65) return 'var(--color-warning)';
    return 'var(--color-success)';
  });

  const actionLabels: Record<string, string> = {
    upload_completed:    'Upload zakończony',
    file_deleted:        'Plik usunięty',
    folder_deleted:      'Folder usunięty',
    quota_exceeded:      'Przekroczono limit',
    share_link_accessed: 'Link udostępnienia',
  };

  const uploadStatusLabels: Record<string, string> = {
    pending:   'Oczekuje',
    completed: 'Gotowy',
    failed:    'Błąd',
  };

  onMount(() => {
    let cancelled = false;
    (async () => {
      const user = await authState.checkSession();
      if (cancelled) return;
      if (!user) { window.location.replace('/login'); return; }
      sessionReady = true;

      try {
        const [svcRes, usageRes, auditRes, uploadsRes] = await Promise.all([
          apiClient.admin.serviceDetail(),
          apiClient.admin.usage(),
          apiClient.admin.auditLog({ limit: 25 }),
          apiClient.admin.listUploads({ limit: 20 }),
        ]);
        service = svcRes.service;
        usage = usageRes;
        auditLog = auditRes.items;
        uploads = uploadsRes.items;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Nie udało się pobrać danych admina.';
      } finally {
        isLoading = false;
      }
    })();
    return () => { cancelled = true; };
  });
</script>

<section class="admin-wrap mx-auto w-full max-w-5xl">
  <header>
    <div class="header-icon"><ShieldCheck size={20} /></div>
    <div>
      <h1>Panel Administratora</h1>
      <p>Zarządzanie serwisem i monitoring</p>
    </div>
  </header>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else}
    <div class="grid-2">
      <!-- Service Info -->
      <div class="card glass">
        <div class="card-header">
          <HardDrive size={18} />
          <h2>Informacje o serwisie</h2>
        </div>
        {#if service}
          <dl class="info-list">
            <div class="info-row"><dt>Nazwa</dt><dd>{service.name}</dd></div>
            <div class="info-row"><dt>ID</dt><dd class="mono">{service.id}</dd></div>
            <div class="info-row"><dt>Maks. rozmiar pliku</dt><dd>{formatBytes(service.max_file_size_bytes)}</dd></div>
            <div class="info-row"><dt>Limit storage</dt><dd>{formatBytes(service.max_storage_bytes)}</dd></div>
          </dl>
        {/if}
      </div>

      <!-- Usage -->
      <div class="card glass">
        <div class="card-header">
          <Activity size={18} />
          <h2>Użycie storage</h2>
        </div>
        {#if usage}
          <div class="usage-bar-wrap">
            <div class="usage-bar-track">
              <div
                class="usage-bar-fill"
                style="width: {Math.min(usage.used_percent, 100)}%; background: {usageColor};"
              ></div>
            </div>
            <div class="usage-labels">
              <span class="usage-pct" style="color: {usageColor};">{usage.used_percent.toFixed(1)}%</span>
              <span class="usage-nums">{formatBytes(usage.current_used_bytes)} / {formatBytes(usage.max_storage_bytes)}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Audit Log -->
    <div class="card glass mt">
      <div class="card-header">
        <Activity size={18} />
        <h2>Ostatnie zdarzenia</h2>
      </div>
      {#if auditLog.length === 0}
        <p class="empty-text">Brak zdarzeń.</p>
      {:else}
        <div class="table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Akcja</th>
                <th>Użytkownik</th>
                <th>Typ zasobu</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {#each auditLog as event (event.id)}
                <tr>
                  <td><span class="action-badge">{actionLabels[event.action] ?? event.action}</span></td>
                  <td class="mono">{event.user_id.slice(0, 12)}…</td>
                  <td>{event.resource_type}</td>
                  <td class="date-cell">{formatDate(event.created_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>

    <!-- Recent Uploads -->
    <div class="card glass mt">
      <div class="card-header">
        <Upload size={18} />
        <h2>Ostatnie uploady</h2>
      </div>
      {#if uploads.length === 0}
        <p class="empty-text">Brak uploadów.</p>
      {:else}
        <div class="table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Plik</th>
                <th>Rozmiar</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {#each uploads as upload (upload.id)}
                <tr>
                  <td class="filename-cell">{upload.filename}</td>
                  <td>{formatBytes(upload.size)}</td>
                  <td>
                    <span class="status-badge status-{upload.status}">
                      {uploadStatusLabels[upload.status] ?? upload.status}
                    </span>
                  </td>
                  <td class="date-cell">{formatDate(upload.created_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-wrap {
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .header-icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--color-accent-muted) 80%, transparent);
    border: 1px solid var(--color-border-default);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  h1 {
    font-size: clamp(1.5rem, 2vw, 2rem);
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
    line-height: 1.1;
  }

  header p { color: var(--color-text-secondary); font-size: var(--text-sm); }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    padding: 9px 12px;
    margin-bottom: var(--space-3);
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .state-wrap {
    min-height: 40dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spin { animation: spin 900ms linear infinite; color: var(--color-text-secondary); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .card {
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-5);
  }

  .card.mt { margin-top: var(--space-4); }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    color: var(--color-text-secondary);
  }

  .card-header h2 {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .info-list { display: grid; gap: var(--space-2); }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    min-height: 36px;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: var(--space-2);
  }

  .info-row:last-child { border-bottom: none; }

  .info-row dt { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .info-row dd { font-size: var(--text-sm); color: var(--color-text-primary); font-weight: 500; text-align: right; }
  .mono { font-family: var(--font-mono); font-size: var(--text-xs) !important; }

  .usage-bar-wrap { display: grid; gap: var(--space-3); }

  .usage-bar-track {
    height: 8px;
    border-radius: var(--radius-full);
    background: var(--color-bg-overlay);
    overflow: hidden;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 600ms var(--ease-out-expo);
  }

  .usage-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }

  .usage-pct { font-size: var(--text-2xl); font-weight: 600; letter-spacing: -0.03em; line-height: 1; }
  .usage-nums { font-size: var(--text-xs); color: var(--color-text-secondary); }

  .table-wrap { overflow-x: auto; }

  .audit-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .audit-table th {
    text-align: left;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .audit-table td {
    padding: 10px 8px;
    color: var(--color-text-primary);
    border-bottom: 1px solid var(--color-border-subtle);
    vertical-align: middle;
  }

  .audit-table tr:last-child td { border-bottom: none; }

  .action-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
    background: var(--color-accent-muted);
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .status-badge.status-completed {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .status-badge.status-pending {
    background: color-mix(in oklab, var(--color-warning) 16%, transparent);
    color: var(--color-warning);
  }

  .status-badge.status-failed {
    background: color-mix(in oklab, var(--color-danger) 16%, transparent);
    color: var(--color-danger);
  }

  .filename-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-cell { color: var(--color-text-secondary); white-space: nowrap; }
  .empty-text { color: var(--color-text-secondary); font-size: var(--text-sm); padding: var(--space-2) 0; }

  @media (min-width: 768px) {
    .admin-wrap { padding-top: var(--space-6); padding-bottom: var(--space-8); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
    .usage-bar-fill { transition: none; }
  }
</style>
```

- [ ] **Commit**

```bash
git add apps/frontend/src/routes/(app)/admin/
git commit -m "feat(frontend): add admin panel page"
```

---

## Task 14: Frontend — TrashBrowser z folderami

**Files:**
- Modify: `apps/frontend/src/components/files/TrashBrowser.svelte`

- [ ] **Zastąp całą zawartość pliku**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { FileRecord, Folder } from '@unisource/sdk';
  import { LoaderCircle, Trash2, Undo2, FolderOpen } from 'lucide-svelte';

  import { apiClient } from '../../lib/api';
  import { authState } from '../../state/auth.svelte';
  import Button from '../ui/Button.svelte';

  type TrashItem =
    | { kind: 'file'; data: FileRecord }
    | { kind: 'folder'; data: Folder };

  let isLoading = $state(true);
  let sessionReady = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let items = $state<TrashItem[]>([]);
  let busyId = $state<string | null>(null);
  let bannerTimer: ReturnType<typeof setTimeout> | null = null;

  function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  function itemName(item: TrashItem): string {
    return item.kind === 'file' ? item.data.filename : item.data.name;
  }

  function itemMeta(item: TrashItem): string {
    const ts = item.kind === 'file'
      ? (item.data.trashed_at ?? item.data.updated_at)
      : (item.data.trashed_at ?? item.data.updated_at);
    const date = new Date(ts * 1000).toLocaleDateString('pl-PL');
    if (item.kind === 'file') return `${formatBytes(item.data.size)} • usunięto ${date}`;
    return `Folder • usunięto ${date}`;
  }

  async function loadTrash() {
    isLoading = true;
    error = null;
    try {
      const [filesRes, foldersRes] = await Promise.all([
        apiClient.myFiles.trash({ limit: 100 }),
        apiClient.folders.list({ is_trashed: true, limit: 100 }),
      ]);

      const fileItems: TrashItem[] = filesRes.items.map((f) => ({ kind: 'file', data: f }));
      const folderItems: TrashItem[] = foldersRes.items.map((f) => ({ kind: 'folder', data: f }));

      items = [...folderItems, ...fileItems].sort((a, b) => {
        const tsA = a.kind === 'file' ? (a.data.trashed_at ?? a.data.updated_at) : (a.data.trashed_at ?? a.data.updated_at);
        const tsB = b.kind === 'file' ? (b.data.trashed_at ?? b.data.updated_at) : (b.data.trashed_at ?? b.data.updated_at);
        return tsB - tsA;
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się pobrać zawartości kosza.';
    } finally {
      isLoading = false;
    }
  }

  function scheduleBannerClear() {
    if (bannerTimer) window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      message = null;
      error = null;
      bannerTimer = null;
    }, 4200);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const currentUser = await authState.checkSession();
      if (cancelled) return;
      if (!currentUser) {
        const redirectTarget = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?redirect=${encodeURIComponent(redirectTarget)}`);
        return;
      }
      sessionReady = true;
      await loadTrash();
    })();
    return () => {
      cancelled = true;
      if (bannerTimer) window.clearTimeout(bannerTimer);
    };
  });

  async function restore(item: TrashItem) {
    busyId = item.kind === 'file' ? item.data.id : item.data.id;
    try {
      if (item.kind === 'file') {
        await apiClient.myFiles.restore(item.data.id);
      } else {
        await apiClient.folders.restore(item.data.id);
      }
      message = `Przywrócono: ${itemName(item)}`;
      scheduleBannerClear();
      await loadTrash();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się przywrócić elementu.';
      scheduleBannerClear();
    } finally {
      busyId = null;
    }
  }

  async function removeForever(item: TrashItem) {
    busyId = item.kind === 'file' ? item.data.id : item.data.id;
    try {
      if (item.kind === 'file') {
        await apiClient.myFiles.delete(item.data.id, { permanent: true });
      } else {
        await apiClient.folders.delete(item.data.id, { permanent: true });
      }
      message = `Usunięto na stałe: ${itemName(item)}`;
      scheduleBannerClear();
      await loadTrash();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się usunąć elementu na stałe.';
      scheduleBannerClear();
    } finally {
      busyId = null;
    }
  }
</script>

<section class="trash-wrap mx-auto w-full max-w-4xl xl:max-w-5xl">
  <header>
    <h1>Kosz</h1>
    <p>Pliki i foldery w koszu możesz przywrócić lub usunąć bezpowrotnie.</p>
  </header>

  {#if error}
    <div class="banner banner-error" role="alert">{error}</div>
  {/if}

  {#if message}
    <div class="banner banner-success" role="status">{message}</div>
  {/if}

  {#if !sessionReady || isLoading}
    <div class="state-wrap">
      <div class="spin"><LoaderCircle size={36} /></div>
    </div>
  {:else if items.length === 0}
    <div class="state-wrap">
      <div class="empty-card glass">
        <Trash2 size={30} />
        <h2>Kosz jest pusty</h2>
        <p>Usunięte elementy pojawią się tutaj.</p>
      </div>
    </div>
  {:else}
    <div class="table glass">
      {#each items as item (item.data.id)}
        <article class="row">
          <div class="row-icon">
            {#if item.kind === 'folder'}
              <FolderOpen size={20} />
            {:else}
              <Trash2 size={20} />
            {/if}
          </div>
          <div class="meta">
            <h3>{itemName(item)}</h3>
            <p>{itemMeta(item)}</p>
          </div>
          <div class="actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={busyId === item.data.id}
              onclick={() => restore(item)}
            >
              <span class="inline-flex items-center gap-1"><Undo2 size={14} /> Przywróć</span>
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busyId === item.data.id}
              onclick={() => removeForever(item)}
            >
              Usuń na zawsze
            </Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .trash-wrap {
    width: 100%;
    margin: 0 auto;
    min-height: 100%;
    padding: var(--space-4) var(--shell-px) calc(84px + env(safe-area-inset-bottom));
  }

  header { display: grid; gap: 6px; margin-bottom: var(--space-5); }

  h1 {
    font-size: clamp(1.8rem, 2.4vw, 2.2rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
  }

  header p { color: var(--color-text-secondary); font-size: var(--text-sm); }

  .banner {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    font-size: var(--text-sm);
    line-height: var(--leading-sm);
    padding: 9px 12px;
    margin-bottom: var(--space-3);
  }

  .banner-error {
    border-color: color-mix(in oklab, var(--color-danger) 30%, transparent);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
  }

  .banner-success {
    border-color: color-mix(in oklab, var(--color-success) 30%, transparent);
    background: color-mix(in oklab, var(--color-success) 14%, transparent);
    color: color-mix(in oklab, var(--color-success) 95%, #fff);
  }

  .state-wrap {
    min-height: 56dvh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-card {
    width: min(560px, 100%);
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-6);
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .empty-card h2 { color: var(--color-text-primary); font-size: var(--text-lg); }

  .table {
    border-radius: var(--radius-lg);
    border-color: var(--color-glass-border);
    padding: var(--space-2);
    display: grid;
    gap: 4px;
  }

  .row {
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    min-height: 56px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: color-mix(in oklab, var(--color-bg-elevated) 72%, transparent);
  }

  .row-icon { color: var(--color-text-secondary); flex-shrink: 0; }

  .meta { min-width: 0; flex: 1; }

  .meta h3 {
    color: var(--color-text-primary);
    font-size: var(--text-base);
    font-weight: 500;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .meta p { color: var(--color-text-secondary); font-size: var(--text-xs); margin-top: 2px; }

  .actions {
    display: inline-flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .spin { animation: spin 900ms linear infinite; color: var(--color-text-secondary); }

  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  @media (max-width: 760px) {
    .row { flex-direction: column; align-items: flex-start; }
    .actions { width: 100%; justify-content: flex-start; }
  }

  @media (min-width: 768px) {
    .trash-wrap { padding-top: var(--space-6); padding-bottom: var(--space-8); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
  }
</style>
```

- [ ] **Commit**

```bash
git add apps/frontend/src/components/files/TrashBrowser.svelte
git commit -m "feat(frontend): add folder restore to TrashBrowser"
```

---

## Task 15: Frontend — ContextMenu akcja share

**Files:**
- Modify: `apps/frontend/src/components/files/ContextMenu.svelte`

- [ ] **Dodaj `share` do `ContextAction` i widok przycisku**

Zmień typ:

```typescript
type ContextAction = 'download' | 'rename' | 'move' | 'delete' | 'share';
```

Dodaj import `Share2` z lucide:

```typescript
import { Download, Edit2, FolderInput, Share2, Trash2 } from 'lucide-svelte';
```

Dodaj `canShare` derived (tylko pliki):

```typescript
const canShare = $derived(isFileItem(item));
```

W template, po przycisku rename, dodaj (z separatorem przed delete):

```svelte
{#if canShare}
  <button class="menu-item" onclick={() => handleAction('share')} role="menuitem" type="button">
    <Share2 size={18} />
    <span>Udostępnij</span>
  </button>
{/if}
```

Zaktualizuj `menuHeight` na `260` (jedno menu-item więcej).

- [ ] **Commit**

```bash
git add apps/frontend/src/components/files/ContextMenu.svelte
git commit -m "feat(frontend): add share action to context menu"
```

---

## Task 16: Frontend — ShareLinksModal komponent

**Files:**
- Create: `apps/frontend/src/components/files/ShareLinksModal.svelte`

- [ ] **Utwórz komponent**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { spring } from 'svelte/motion';
  import {
    X, Plus, Copy, Check, Link2, Lock, Trash2, ToggleLeft, ToggleRight, LoaderCircle
  } from 'lucide-svelte';
  import type { ShareLink } from '@unisource/sdk';
  import { apiClient } from '../../lib/api';

  let {
    fileId,
    filename,
    onclose,
  } = $props<{
    fileId: string;
    filename: string;
    onclose: () => void;
  }>();

  const PUBLIC_URL = (typeof window !== 'undefined' ? window.location.origin : '');

  let links = $state<ShareLink[]>([]);
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let copiedId = $state<string | null>(null);

  let showCreateForm = $state(false);
  let newName = $state('');
  let newSlug = $state('');
  let newPassword = $state('');
  let newExpiry = $state('');
  let newMaxDl = $state('');

  const scale = spring(0.96, { stiffness: 0.14, damping: 0.72 });
  const opacity = spring(0, { stiffness: 0.22, damping: 1 });

  onMount(async () => {
    scale.set(1);
    opacity.set(1);
    await loadLinks();
  });

  async function loadLinks() {
    isLoading = true;
    error = null;
    try {
      const res = await apiClient.shareLinks.list(fileId);
      links = res.items;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Błąd ładowania linków.';
    } finally {
      isLoading = false;
    }
  }

  async function createLink() {
    isSaving = true;
    error = null;
    try {
      const body: Record<string, unknown> = {};
      if (newName.trim()) body.name = newName.trim();
      if (newSlug.trim()) body.slug = newSlug.trim();
      if (newPassword.trim()) body.password = newPassword.trim();
      if (newExpiry) body.expires_at = Math.floor(new Date(newExpiry).getTime() / 1000);
      if (newMaxDl) body.max_downloads = parseInt(newMaxDl, 10);

      const res = await apiClient.shareLinks.create(fileId, body as any);
      links = [res.link, ...links];
      showCreateForm = false;
      newName = newSlug = newPassword = newExpiry = newMaxDl = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Nie udało się utworzyć linku.';
    } finally {
      isSaving = false;
    }
  }

  async function toggleActive(link: ShareLink) {
    try {
      const res = await apiClient.shareLinks.update(link.id, { is_active: !link.is_active });
      links = links.map((l) => (l.id === link.id ? res.link : l));
    } catch {
      error = 'Nie udało się zmienić statusu linku.';
    }
  }

  async function deleteLink(link: ShareLink) {
    try {
      await apiClient.shareLinks.delete(link.id);
      links = links.filter((l) => l.id !== link.id);
    } catch {
      error = 'Nie udało się usunąć linku.';
    }
  }

  function copyLink(link: ShareLink) {
    const url = `${PUBLIC_URL}/s/${link.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      copiedId = link.id;
      setTimeout(() => { copiedId = null; }, 2000);
    });
  }

  function linkUrl(link: ShareLink) {
    return `${PUBLIC_URL}/s/${link.slug}`;
  }

  function formatExpiry(ts: number | null): string {
    if (!ts) return 'Wieczny';
    const d = new Date(ts * 1000);
    const now = Date.now();
    if (d.getTime() < now) return 'Wygasł';
    return d.toLocaleDateString('pl-PL');
  }

  function linkStatus(link: ShareLink): { label: string; cls: string } {
    const now = Math.floor(Date.now() / 1000);
    if (!link.is_active) return { label: 'Dezaktywowany', cls: 'status-off' };
    if (link.expires_at && link.expires_at < now) return { label: 'Wygasł', cls: 'status-expired' };
    if (link.max_downloads !== null && link.download_count >= link.max_downloads)
      return { label: 'Limit', cls: 'status-expired' };
    return { label: 'Aktywny', cls: 'status-on' };
  }

  function closeModal() {
    scale.set(0.97);
    opacity.set(0);
    setTimeout(onclose, 180);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<button
  class="backdrop"
  type="button"
  aria-label="Zamknij"
  style="opacity: {$opacity * 0.6};"
  onclick={closeModal}
></button>

<!-- Modal -->
<div
  class="modal glass"
  role="dialog"
  aria-modal="true"
  aria-label="Udostępnianie pliku"
  style="transform: scale({$scale}); opacity: {$opacity};"
  onclick={(e) => e.stopPropagation()}
>
  <div class="modal-header">
    <div class="modal-title">
      <Link2 size={18} />
      <span>Udostępnij — {filename}</span>
    </div>
    <button class="close-btn" type="button" aria-label="Zamknij" onclick={closeModal}>
      <X size={18} />
    </button>
  </div>

  {#if error}
    <div class="error-banner" role="alert">{error}</div>
  {/if}

  <div class="modal-body">
    {#if isLoading}
      <div class="loading-state">
        <div class="spin"><LoaderCircle size={28} /></div>
      </div>
    {:else}
      <!-- Links list -->
      {#if links.length > 0}
        <div class="links-list">
          {#each links as link (link.id)}
            {@const status = linkStatus(link)}
            <div class="link-card glass-inner">
              <div class="link-top">
                <div class="link-name-wrap">
                  <span class="link-name">{link.name ?? `/${link.slug}`}</span>
                  <span class="status-dot {status.cls}">{status.label}</span>
                </div>
                <div class="link-actions">
                  <button
                    class="icon-btn"
                    type="button"
                    aria-label={link.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                    onclick={() => toggleActive(link)}
                    title={link.is_active ? 'Dezaktywuj' : 'Aktywuj'}
                  >
                    {#if link.is_active}
                      <ToggleRight size={18} class="text-success" />
                    {:else}
                      <ToggleLeft size={18} />
                    {/if}
                  </button>
                  <button
                    class="icon-btn"
                    type="button"
                    aria-label="Kopiuj link"
                    onclick={() => copyLink(link)}
                  >
                    {#if copiedId === link.id}
                      <Check size={16} class="text-success" />
                    {:else}
                      <Copy size={16} />
                    {/if}
                  </button>
                  <button
                    class="icon-btn is-danger"
                    type="button"
                    aria-label="Usuń link"
                    onclick={() => deleteLink(link)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div class="link-url-row">
                <span class="link-url">{linkUrl(link)}</span>
              </div>

              <div class="link-meta-row">
                {#if link.has_password}<span class="meta-chip"><Lock size={11} /> Hasło</span>{/if}
                <span class="meta-chip">Wygasa: {formatExpiry(link.expires_at)}</span>
                <span class="meta-chip">{link.download_count}{link.max_downloads !== null ? `/${link.max_downloads}` : ''} pobrań</span>
              </div>
            </div>
          {/each}
        </div>
      {:else if !showCreateForm}
        <div class="empty-links">
          <Link2 size={24} />
          <p>Brak linków. Utwórz pierwszy link do udostępniania.</p>
        </div>
      {/if}

      <!-- Create form -->
      {#if showCreateForm}
        <div class="create-form glass-inner">
          <h3 class="form-title">Nowy link</h3>

          <div class="form-grid">
            <label class="form-label">
              Nazwa (opcjonalna)
              <input type="text" class="form-input" placeholder="np. Dla klienta" bind:value={newName} maxlength={128} />
            </label>

            <label class="form-label">
              Custom slug (opcjonalny)
              <div class="slug-wrap">
                <span class="slug-prefix">/s/</span>
                <input type="text" class="form-input slug-input" placeholder="moj-link" bind:value={newSlug} maxlength={64} />
              </div>
            </label>

            <label class="form-label">
              Hasło (opcjonalne)
              <input type="password" class="form-input" placeholder="Zostaw puste = brak hasła" bind:value={newPassword} />
            </label>

            <label class="form-label">
              Wygasa
              <input type="date" class="form-input" bind:value={newExpiry} min={new Date().toISOString().slice(0, 10)} />
            </label>

            <label class="form-label">
              Limit pobrań (opcjonalny)
              <input type="number" class="form-input" placeholder="np. 10" bind:value={newMaxDl} min={1} />
            </label>
          </div>

          <div class="form-actions">
            <button class="btn-secondary" type="button" onclick={() => { showCreateForm = false; error = null; }}>
              Anuluj
            </button>
            <button class="btn-primary" type="button" disabled={isSaving} onclick={createLink}>
              {isSaving ? 'Tworzę…' : 'Utwórz link'}
            </button>
          </div>
        </div>
      {/if}

      <!-- Add button -->
      {#if !showCreateForm}
        <button class="add-btn" type="button" onclick={() => { showCreateForm = true; error = null; }}>
          <Plus size={16} />
          Dodaj link
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: none;
    cursor: default;
  }

  .modal {
    position: fixed;
    z-index: 70;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    width: min(560px, calc(100vw - 2 * var(--space-4)));
    max-height: min(80dvh, 700px);
    border-radius: var(--radius-xl);
    border-color: var(--color-glass-border);
    display: flex;
    flex-direction: column;
    box-shadow: 0 40px 80px color-mix(in oklab, #000 50%, transparent);
    will-change: transform;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .modal-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-primary);
    font-size: var(--text-base);
    font-weight: 600;
    min-width: 0;
  }

  .modal-title span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-btn {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-in-out);
    flex-shrink: 0;
  }

  .close-btn:hover { background: var(--color-accent-muted); color: var(--color-text-primary); border-color: var(--color-border-default); }

  .error-banner {
    padding: 8px var(--space-5);
    font-size: var(--text-sm);
    color: color-mix(in oklab, var(--color-danger) 90%, #fff);
    background: color-mix(in oklab, var(--color-danger) 14%, transparent);
    border-bottom: 1px solid color-mix(in oklab, var(--color-danger) 20%, transparent);
    flex-shrink: 0;
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
  }

  .spin { animation: spin 900ms linear infinite; color: var(--color-text-secondary); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .links-list { display: flex; flex-direction: column; gap: var(--space-2); }

  .link-card {
    border-radius: var(--radius-md);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .glass-inner {
    background: color-mix(in oklab, var(--color-bg-elevated) 60%, transparent);
    border: 1px solid var(--color-border-subtle);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .link-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .link-name-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .link-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    display: inline-block;
    font-size: var(--text-xs);
    font-weight: 500;
    padding: 1px 7px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .status-on {
    background: color-mix(in oklab, var(--color-success) 16%, transparent);
    color: var(--color-success);
  }

  .status-off, .status-expired {
    background: color-mix(in oklab, var(--color-text-tertiary) 16%, transparent);
    color: var(--color-text-secondary);
  }

  .link-actions { display: inline-flex; gap: 4px; flex-shrink: 0; }

  .icon-btn {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast) var(--ease-in-out);
  }

  .icon-btn:hover { background: var(--color-accent-muted); color: var(--color-text-primary); border-color: var(--color-border-default); }
  .icon-btn.is-danger:hover { background: color-mix(in oklab, var(--color-danger) 14%, transparent); color: var(--color-danger); border-color: color-mix(in oklab, var(--color-danger) 24%, transparent); }

  .link-url-row { overflow: hidden; }

  .link-url {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .link-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    background: var(--color-accent-muted);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }

  .empty-links {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    text-align: center;
  }

  .create-form {
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .form-title {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .form-grid { display: grid; gap: var(--space-3); }

  .form-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .form-input {
    height: 40px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border-default);
    background: var(--color-bg-overlay);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    padding: 0 var(--space-3);
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-in-out),
                box-shadow var(--duration-fast) var(--ease-in-out);
  }

  .form-input:focus { border-color: var(--color-border-strong); box-shadow: 0 0 0 3px var(--color-accent-muted); }

  .slug-wrap { display: flex; align-items: center; gap: 0; }

  .slug-prefix {
    height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--space-2);
    background: var(--color-bg-overlay);
    border: 1px solid var(--color-border-default);
    border-right: none;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }

  .slug-input { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; flex: 1; }

  .form-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }

  .btn-primary, .btn-secondary {
    height: 38px;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 500;
    padding: 0 var(--space-4);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-in-out),
                transform var(--duration-instant) var(--ease-spring);
  }

  .btn-primary {
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    border: 1px solid var(--color-border-default);
  }

  .btn-primary:hover:not(:disabled) { opacity: 0.88; }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-secondary {
    background: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border-default);
  }

  .btn-secondary:hover { background: var(--color-accent-muted); color: var(--color-text-primary); }

  .add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border-default);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-in-out);
    align-self: flex-start;
  }

  .add-btn:hover { background: var(--color-accent-muted); color: var(--color-text-primary); border-color: var(--color-border-strong); border-style: solid; }

  :global(.text-success) { color: var(--color-success) !important; }

  @media (prefers-reduced-motion: reduce) {
    .modal, .backdrop, .btn-primary { transition-duration: 0.01ms; }
    .spin { animation: none; }
  }
</style>
```

- [ ] **Commit**

```bash
git add apps/frontend/src/components/files/ShareLinksModal.svelte
git commit -m "feat(frontend): add ShareLinksModal component"
```

---

## Task 17: Frontend — integracja ShareLinksModal w DriveBrowser

**Files:**
- Modify: `apps/frontend/src/components/files/DriveBrowser.svelte`

- [ ] **Dodaj import i stan**

Na górze `<script>`, po istniejących importach, dodaj:

```typescript
import ShareLinksModal from './ShareLinksModal.svelte';
```

W sekcji `let` dodaj:

```typescript
let shareTarget = $state<DriveItem | null>(null);
```

- [ ] **Zaktualizuj handler akcji kontekstowych**

Znajdź handler `onaction` lub funkcję obsługującą akcje ContextMenu. Dodaj gałąź `share`:

```typescript
case 'share':
  shareTarget = item;
  contextMenuConfig = null;
  break;
```

- [ ] **Dodaj modal w template**

Na końcu template (przed `</div>` zamykającym główny wrapper), dodaj:

```svelte
{#if shareTarget && shareTarget.kind === 'file'}
  <ShareLinksModal
    fileId={shareTarget.id}
    filename={shareTarget.name}
    onclose={() => { shareTarget = null; }}
  />
{/if}
```

- [ ] **Commit**

```bash
git add apps/frontend/src/components/files/DriveBrowser.svelte
git commit -m "feat(frontend): integrate ShareLinksModal into DriveBrowser"
```

---

## Task 18: Weryfikacja typechecku i budowania

- [ ] **Typecheck SDK**

```bash
pnpm --filter @unisource/sdk dev
```

Oczekiwane: uruchamia się bez błędów TypeScript.

- [ ] **Typecheck backend**

```bash
pnpm --filter backend typecheck
```

Oczekiwane: `0 errors`

- [ ] **Typecheck frontend**

```bash
pnpm --filter frontend check
```

Oczekiwane: `0 errors`

- [ ] **Uruchom backend lokalnie**

```bash
pnpm --filter backend dev
```

Sprawdź że `/health` zwraca `{"status":"ok"}`.

- [ ] **Uruchom frontend lokalnie i przetestuj golden paths**

```bash
pnpm --filter frontend dev
```

Sprawdź:
1. `/drive` → context menu na pliku → "Udostępnij" → modal otwiera się
2. Tworzenie linku (bez hasła) → kopiowanie URL
3. Tworzenie linku z hasłem i expiry
4. Toggle aktywności linku
5. `/s/<slug>` → strona publiczna ładuje się (bez auth)
6. `/s/<slug>` dla linku z hasłem → formularz hasła
7. `/trash` → foldery w koszu widoczne → restore folderu działa
8. `/admin` → dane serwisu, usage bar, audit log, upload list
9. Sidebar ma link "Admin"

- [ ] **Finalny commit**

```bash
git add -A
git commit -m "chore: final verification pass — share links, admin UI, trash folders"
```
