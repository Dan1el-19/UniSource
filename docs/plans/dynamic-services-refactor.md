# Plan: Dynamic Services Refactor

## Goal

Replace the hardcoded `SERVICES` map in `apps/backend/src/config/services.ts` with dynamic D1 lookups so the `usrc.dev` superadmin panel becomes the single source of truth for service configuration.

## Decisions (confirmed by user)

- Add `object_key_prefix` column to D1 `services` table; expose as editable field in superadmin panel.
- Drop the `LEGACY_API_KEYS_ENABLED` fallback entirely. New services use D1 `api_keys` only.
- Move `WorkerVariables` from `worker-configuration.d.ts` (ambient) to `apps/backend/src/types/worker.d.ts` so it can `import type { ServiceRecord }`.
- BYPASS_CF_ACCESS guard not needed (already verified safe in production).

## Out of scope

- Cleanup of `usrc` default service (separate refactor, see `apps/backend/CLAUDE.md`).
- Automatic R2 binding provisioning. Adding a new service still requires a manual `wrangler.jsonc` edit + redeploy. Panel will warn about this.
- Per-service CORS enforcement (separate concern).
- Audit log for superadmin actions (separate concern).

## Architecture summary

Before:
- Hardcoded `SERVICES` dict with `{id, bucketName, bucketEnvKey, objectKeyPrefix, apiKeyEnvVar, maxFileSizeBytes}`.
- 8 routes call `getServiceConfig(serviceId)`.
- Auth middleware uses sync `isKnownServiceId(rawServiceId)`.

After:
- D1 `services` table extended with `object_key_prefix`.
- Auth middleware does `await getServiceDetails(c.env.usrc_d1, serviceId)` and sets `c.set('service', service)`.
- Routes consume `c.get('service')` for config; existing rows (`files`, `uploads`, `releases`) continue to use stored `record.bucket`.
- R2 binding key resolved dynamically from bucket name (`chmura-blokserwis` → `CHMURA_BLOKSERWIS_BUCKET`, `unisource` → `USRC_BUCKET`).
- Storage key builders moved to a new `services/storageKeys.ts` module that takes a prefix string.
- `config/services.ts` shrinks to a `DEFAULT_SERVICE_ID` constant.

## Tasks

### Task 1: Migration 0018 + extend ServiceRecord type

**Files:**
- Create `apps/backend/src/db/migrations/0018_services_object_key_prefix.sql`
- Edit `apps/backend/src/db/services.ts`

**Migration content:**
```sql
-- Migration 0018 — Add object_key_prefix to services for dynamic R2 storage layout
ALTER TABLE services ADD COLUMN object_key_prefix TEXT NOT NULL DEFAULT '';

-- Seed existing services with the prefixes that previously lived in SERVICES map
UPDATE services SET object_key_prefix = 'usrc' WHERE id = 'usrc';
-- chmura-blokserwis and com-blokserwis-db keep '' (their previous behaviour)
```

**ServiceRecord update:** Add `object_key_prefix: string` field. `getServiceDetails` already uses `SELECT *`, so the column flows through automatically.

**Acceptance:**
- File `0018_services_object_key_prefix.sql` exists.
- `ServiceRecord` interface in `db/services.ts` has `object_key_prefix: string`.
- `pnpm --filter backend typecheck` passes.

### Task 2: Move WorkerVariables to dedicated .d.ts

**Files:**
- Create `apps/backend/src/types/worker.d.ts`
- Edit `apps/backend/worker-configuration.d.ts` (remove WorkerVariables, keep CloudflareBindings)

**New file content:**
```typescript
import type { ServiceRecord } from '../db/services';

declare global {
  interface WorkerVariables {
    userId: string;
    serviceId: string;
    authType: 'appwrite' | 'apikey';
    isAdmin: boolean;
    serviceRole?: 'user' | 'plus' | 'admin' | 'system';
    actorId?: string;
    appwriteJwt?: string;
    /** Service config resolved from D1 by authMiddleware. Always present after auth. */
    service?: ServiceRecord;
  }
}

export {};
```

**Update `tsconfig.json`** if needed so the new `src/types/*.d.ts` is picked up.

**Acceptance:**
- `WorkerVariables` is no longer in `worker-configuration.d.ts`.
- New file declares the interface globally with `service?: ServiceRecord` field.
- `pnpm --filter backend typecheck` passes.

### Task 3: Create services/storageKeys.ts module

**Files:**
- Create `apps/backend/src/services/storageKeys.ts`
- Move from `config/services.ts`: `buildStorageKey`, `buildAppwriteStorageKey`, `buildReleaseStorageKey`, `getReleaseStoragePrefix`, `sanitizeFilenameForStorage`.

**Signature changes:** All public functions take `prefix: string` instead of `serviceId: string`. Examples:
```typescript
export function buildStorageKey(prefix: string, datePath: string, uploadId: string, ext: string): string {
  const path = `uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
  return prefix ? `${prefix}/${path}` : path;
}

export function buildReleaseStorageKey(prefix: string, filename: string): string {
  const safeName = sanitizeFilenameForStorage(filename);
  return `releases/${prefix ? `${prefix}/` : ''}${safeName}`;
}

export function getReleaseStoragePrefix(prefix: string): string {
  return `releases/${prefix ? `${prefix}/` : ''}`;
}
```

**Acceptance:**
- New module exports the four builder functions and one helper.
- No new functionality; only relocation + signature change.
- `config/services.ts` still has the old functions at this point (deleted in Task 10).

### Task 4: Refactor middleware/auth.ts

**File:** `apps/backend/src/middleware/auth.ts`

**Changes:**
1. Remove imports of `isKnownServiceId` and `getServiceConfig`. Keep `DEFAULT_SERVICE_ID`.
2. Add `import { getServiceDetails } from '../db/services';`
3. Replace `isKnownServiceId` synchronous check (lines ~127-129) with:
   ```typescript
   const service = await getServiceDetails(c.env.usrc_d1, serviceId);
   if (!service) {
     return c.json({ error: 'Bad Request', message: `Unknown service: ${serviceId}` }, 400);
   }
   c.set('service', service);
   ```
4. **Remove the entire `legacyEnabled` block (lines ~195-211).** No fallback to env-var keys.

**Acceptance:**
- `isKnownServiceId` and `getServiceConfig` no longer imported in `auth.ts`.
- `c.set('service', service)` called for every authenticated request.
- `LEGACY_API_KEYS_ENABLED` block deleted.
- Existing tests for D1 api_keys path still pass.
- `pnpm --filter backend typecheck` passes.

### Task 5: Refactor services/r2.ts

**File:** `apps/backend/src/services/r2.ts`

**Changes:**
1. Remove `import { SERVICES } from '../config/services';`.
2. Replace `serviceByBucketName` and `bindingByBucketName` with:
   ```typescript
   function getBucketEnvKey(bucketName: string): string {
     if (bucketName === 'unisource') return 'USRC_BUCKET';
     return bucketName.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_BUCKET';
   }

   function bindingByBucketName(env: CloudflareBindings, bucketName: string): R2Bucket {
     const envKey = getBucketEnvKey(bucketName);
     const binding = (env as unknown as Record<string, R2Bucket | undefined>)[envKey];
     if (!binding) {
       throw new Error(`R2 binding not configured: ${envKey} for bucket: ${bucketName}`);
     }
     return binding;
   }
   ```
3. **Preserve S3 fallback in `headObject`** (commit `c7079f0` added it deliberately). Wrap binding head in try/catch:
   ```typescript
   export async function headObject(env, bucket, key) {
     try {
       const binding = bindingByBucketName(env, bucket);
       const obj = await binding.head(key);
       if (obj) return { size: obj.size };
     } catch { /* fall through to S3 */ }
     return headObjectViaS3(env, bucket, key);
   }
   ```

**Acceptance:**
- No imports from `config/services` in `r2.ts`.
- `getBucketEnvKey` is a pure helper exported nowhere (private).
- All 7 R2 helpers (`headObject`, `deleteObject`, `createMultipartUpload`, `signUploadPart`, `listUploadedParts`, `completeMultipartUpload`, `abortMultipartUpload`) work with the new dynamic binding lookup.
- `pnpm --filter backend test` passes (look for r2.test.ts if it exists).

### Task 6: Refactor routes/upload.ts

**File:** `apps/backend/src/routes/upload.ts`

**Changes:**
1. Replace import `import { getServiceConfig, buildStorageKey, buildAppwriteStorageKey } from '../config/services';` with `import { buildStorageKey, buildAppwriteStorageKey } from '../services/storageKeys';`.
2. In `/r2/init`, `/appwrite/init`, `/r2/multipart/create` handlers:
   - Replace `const svcConfig = getServiceConfig(serviceId)!;` with `const service = c.get('service')!;`
   - `svcConfig.maxFileSizeBytes` → `service.max_file_size_bytes`
   - `svcConfig.bucketName` → `service.default_bucket`
   - Pass `service.object_key_prefix` to `buildStorageKey` / `buildAppwriteStorageKey`.
3. In `/complete` handler (line ~298), replace `const svcConfig = getServiceConfig(record.service_id)!;` + `svcConfig.bucketName` with `record.bucket` (already saved on the row).

**Acceptance:**
- No `getServiceConfig` calls in `upload.ts`.
- `c.get('service')` used everywhere config was previously read.
- `record.bucket` used in `/complete` instead of re-deriving from service config.
- `pnpm --filter backend test` passes.

### Task 7: Refactor routes/releases.ts

**File:** `apps/backend/src/routes/releases.ts`

**Changes:**
1. Replace import `import { buildReleaseStorageKey, getReleaseStoragePrefix, getServiceConfig } from '../config/services';` with `import { buildReleaseStorageKey, getReleaseStoragePrefix } from '../services/storageKeys';`.
2. Across all handlers (`/upload/init`, `/upload/complete`, `/upload/multipart/create`, `/upload/multipart/sign-part`, `/upload/multipart/list-parts`, `/upload/multipart/complete`, `/upload/multipart/abort`, `DELETE /:id`, `/sync`):
   - Replace `getServiceConfig(serviceId)` with `c.get('service')`.
   - `svcConfig.bucketName` → `service.default_bucket`.
   - Pass `service.object_key_prefix` to `buildReleaseStorageKey` and `getReleaseStoragePrefix`.

**Acceptance:**
- No `getServiceConfig` calls in `releases.ts`.
- `c.get('service')` used in all handlers.
- Storage key builders take prefix from `service.object_key_prefix`.
- `pnpm --filter backend test` passes.

### Task 8: Refactor routes/app.ts

**File:** `apps/backend/src/routes/app.ts`

**Changes:**
1. Remove `import { getServiceConfig } from '../config/services';`.
2. `/app/*` already runs under `authMiddleware` (verified in `index.ts:152`), so `c.get('service')` is set.
3. Replace `const svcConfig = getServiceConfig(serviceId);` with `const service = c.get('service')!;`. Remove the explicit 404 since middleware already returns 400 for unknown service.
4. `svcConfig.bucketName` → `service.default_bucket`.

**Acceptance:**
- No `getServiceConfig` calls in `app.ts`.
- Uses `c.get('service')`.
- `pnpm --filter backend test` passes.

### Task 9: Refactor routes/fileRecords.ts, routes/userFiles.ts, routes/public.ts

**Files:**
- `apps/backend/src/routes/fileRecords.ts`
- `apps/backend/src/routes/userFiles.ts`
- `apps/backend/src/routes/public.ts`

**Changes (same pattern in all three):**
1. Remove `import { getServiceConfig } from '../config/services';`.
2. For download URLs and physical deletion: use `record.bucket` (already saved on file rows). The bucket on the file row is the source of truth — admin changing `default_bucket` shouldn't break old downloads.
3. In `public.ts`, the `generateDownloadUrl` function already takes `bucket` as a parameter. Just remove the `getServiceConfig(serviceId)` call inside and use `bucket` directly.

**Acceptance:**
- No `getServiceConfig` calls in any of the three files.
- `record.bucket` (or function param) used everywhere.
- Downloads of pre-existing files continue to work (the bucket value on each row is preserved).
- `pnpm --filter backend test` passes.

### Task 10: Cleanup config/services.ts

**File:** `apps/backend/src/config/services.ts`

**Changes:** Reduce the file to just:
```typescript
export const DEFAULT_SERVICE_ID = 'usrc';
```

Delete: `ServiceConfig` interface, `SERVICES` dict, `getServiceConfig`, `isKnownServiceId`, `buildStorageKey`, `buildAppwriteStorageKey`, `buildReleaseStorageKey`, `getReleaseStoragePrefix`, `sanitizeFilenameForStorage`.

**Verify:** `grep -rn "from.*config/services" apps/backend/src` should only match files importing `DEFAULT_SERVICE_ID`.

**Acceptance:**
- `config/services.ts` is ~3 lines.
- `pnpm --filter backend typecheck` passes.
- `pnpm --filter backend test` passes.

### Task 11: Update superadmin endpoints

**File:** `apps/backend/src/routes/superadmin.ts`

**Changes:**
1. Add `object_key_prefix: z.string().regex(/^[a-z0-9_/-]*$/).max(64).optional().default('')` to `createServiceSchema`.
2. Update INSERT in `POST /services` to include `object_key_prefix`.
3. Add `object_key_prefix: z.string().regex(/^[a-z0-9_/-]*$/).max(64).optional()` to `patchServiceSchema`.
4. Update PATCH dynamic SET clause to handle `object_key_prefix`.
5. Add `object_key_prefix: string` to the inline type in `GET /services` SELECT result type.

**Acceptance:**
- Creating a service via `POST /superadmin/services` accepts `object_key_prefix`.
- Patching accepts and applies `object_key_prefix`.
- Listing services returns the field.
- `pnpm --filter backend typecheck` passes.

### Task 12: Update frontend admin panel

**Files:**
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/routes/services/new/+page.svelte`
- `apps/frontend/src/routes/services/new/+page.server.ts` (if it processes form data)
- `apps/frontend/src/routes/services/[id]/+page.svelte` (edit form, find what's there)

**Changes:**
1. Add `object_key_prefix: string` to `Service` interface in `lib/api.ts`.
2. Add input field to the create form with placeholder "e.g. usrc (optional, default empty)".
3. Pass `object_key_prefix` through form action to `createService`.
4. If the edit page has a form, add the same field there.
5. **Add a warning notice** on the create form: "After creating the service, register the matching R2 bucket binding in `wrangler.jsonc` and redeploy the backend, otherwise uploads will fail with 'R2 binding not configured'."

**Acceptance:**
- Create form has `object_key_prefix` input.
- Field is optional (default empty).
- Warning about R2 binding is visible.
- Edit form (if exists) shows current value and allows editing.
- `pnpm --filter frontend check` (or equivalent) passes.

### Task 13: Full verification

**Commands:**
```
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter frontend check
```

**Manual smoke test (described, not executed):**
- `curl -X GET https://api.usrc.dev/app/releases/latest -H "X-Service-ID: chmura-blokserwis"` should return 200 with a presigned URL.
- `curl -X GET https://api.usrc.dev/app/releases/latest -H "X-Service-ID: nonexistent"` should return 400 "Unknown service".

**Acceptance:**
- All three commands exit 0.
- No `getServiceConfig` calls remain anywhere in `apps/backend`.
- No `SERVICES` references remain anywhere in `apps/backend`.
