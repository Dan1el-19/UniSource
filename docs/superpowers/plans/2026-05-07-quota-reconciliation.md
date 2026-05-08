# Quota Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin endpoint `POST /admin/quota/reconcile` that recalculates `current_used_bytes` in `services` and `service_users` tables from the actual `SUM(files.size)`, detects and fixes drift, and optionally logs an audit event.

**Architecture:** A single DB function `reconcileQuota(db, serviceId, dryRun?)` computes real usage from `files` table (non-trashed), compares to stored counters, updates mismatches, and returns a diff report. The admin route calls this function and returns the report. An optional `?dry_run=true` param skips writes. Extend `service_user_events.action` enum to include `quota_reconciled`.

**Tech Stack:** Hono, Cloudflare Workers (D1), Vitest

---

## Files

- Modify: `apps/backend/src/db/services.ts` — add `reconcileQuota()`
- Modify: `apps/backend/src/routes/admin.ts` — add `POST /admin/quota/reconcile`
- Modify: `apps/backend/src/db/services.ts` — extend `LogEventInput.action` type
- Create: `apps/backend/test/quota-reconciliation.test.ts`

---

### Task 1: Extend audit log action enum

**Files:**
- Modify: `apps/backend/src/db/services.ts`

The `LogEventInput.action` union type on line ~318 must include `'quota_reconciled'` so the reconcile endpoint can log to the audit table.

- [ ] **Step 1: Extend the action type in `db/services.ts`**

Find this type in `apps/backend/src/db/services.ts`:

```typescript
action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed';
```

Replace with (in both `AuditEventRow` and `LogEventInput`):

```typescript
action: 'upload_completed' | 'file_deleted' | 'folder_deleted' | 'quota_exceeded' | 'share_link_accessed' | 'quota_reconciled';
```

There are two occurrences: `AuditEventRow.action` and `LogEventInput.action`. Update both.

Also update the `auditEventActionSchema` in `packages/unisource-sdk/src/services.ts` to add `'quota_reconciled'` to the Zod enum.

- [ ] **Step 2: Run backend tests to confirm nothing broke**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/db/services.ts packages/unisource-sdk/src/services.ts
git commit -m "feat(backend): extend audit action enum with quota_reconciled"
```

---

### Task 2: Implement `reconcileQuota` DB function

**Files:**
- Modify: `apps/backend/src/db/services.ts`
- Create: `apps/backend/test/quota-reconciliation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/test/quota-reconciliation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reconcileQuota } from '../src/db/services';

// Minimal D1 mock that simulates real quota drift
function buildMockD1(serviceUsage: number, userUsages: Record<string, number>, storedServiceBytes: number, storedUserBytes: Record<string, number>): D1Database {
  const prepareMap: Record<string, unknown> = {};

  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: () => {
          // SUM(size) for the whole service
          if (sql.includes('SUM(size)') && !sql.includes('GROUP BY')) {
            return Promise.resolve({ results: [{ used_bytes: serviceUsage }] });
          }
          // SUM(size) per user
          if (sql.includes('GROUP BY user_id')) {
            const rows = Object.entries(userUsages).map(([user_id, used_bytes]) => ({ user_id, used_bytes }));
            return Promise.resolve({ results: rows });
          }
          // current counters from service_users
          if (sql.includes('service_users') && sql.includes('SELECT')) {
            const [serviceId] = args as string[];
            const rows = Object.entries(storedUserBytes).map(([user_id, current_used_bytes]) => ({ user_id, current_used_bytes }));
            return Promise.resolve({ results: rows });
          }
          return Promise.resolve({ results: [] });
        },
        first: () => {
          // services.current_used_bytes
          if (sql.includes('services') && sql.includes('SELECT')) {
            return Promise.resolve({ current_used_bytes: storedServiceBytes });
          }
          return Promise.resolve(null);
        },
        run: () => Promise.resolve({ meta: { changes: 1 }, results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

describe('reconcileQuota', () => {
  it('detects service-level drift when stored bytes differ from real usage', async () => {
    const db = buildMockD1(5000, {}, 3000, {});
    const result = await reconcileQuota(db, 'usrc', true); // dry_run = true
    expect(result.service_drift_bytes).toBe(2000); // 5000 - 3000
    expect(result.users_fixed).toBe(0);
  });

  it('detects no drift when counters are accurate', async () => {
    const db = buildMockD1(3000, { 'user-1': 3000 }, 3000, { 'user-1': 3000 });
    const result = await reconcileQuota(db, 'usrc', true);
    expect(result.service_drift_bytes).toBe(0);
    expect(result.users_fixed).toBe(0);
  });

  it('detects per-user drift', async () => {
    const db = buildMockD1(3000, { 'user-1': 1500, 'user-2': 1500 }, 3000, { 'user-1': 1000, 'user-2': 1500 });
    const result = await reconcileQuota(db, 'usrc', true);
    expect(result.users_fixed).toBe(1); // user-1 has 500 byte drift
  });

  it('applies corrections when dry_run is false', async () => {
    const db = buildMockD1(5000, {}, 3000, {});
    const result = await reconcileQuota(db, 'usrc', false);
    expect(result.service_drift_bytes).toBe(2000);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/quota-reconciliation.test.ts
```

Expected: FAIL — "reconcileQuota is not a function".

- [ ] **Step 3: Implement `reconcileQuota` in `db/services.ts`**

Add after `releaseQuota` in `apps/backend/src/db/services.ts`:

```typescript
export interface ReconcileQuotaResult {
  service_drift_bytes: number;
  service_corrected: boolean;
  users_fixed: number;
  dry_run: boolean;
}

export async function reconcileQuota(
  db: D1Database,
  serviceId: string,
  dryRun = false
): Promise<ReconcileQuotaResult> {
  // Compute real service usage from non-trashed files
  const serviceUsageRow = await db
    .prepare('SELECT COALESCE(SUM(size), 0) AS used_bytes FROM files WHERE service_id = ? AND is_trashed = 0')
    .bind(serviceId)
    .first<{ used_bytes: number | null }>();
  const realServiceBytes = Number(serviceUsageRow?.used_bytes ?? 0);

  // Compute real per-user usage
  const userUsageRows = await db
    .prepare(
      'SELECT user_id, COALESCE(SUM(size), 0) AS used_bytes FROM files WHERE service_id = ? AND is_trashed = 0 GROUP BY user_id'
    )
    .bind(serviceId)
    .all<{ user_id: string; used_bytes: number | null }>();

  // Fetch stored service counter
  const serviceRow = await db
    .prepare('SELECT current_used_bytes FROM services WHERE id = ?')
    .bind(serviceId)
    .first<{ current_used_bytes: number }>();
  const storedServiceBytes = Number(serviceRow?.current_used_bytes ?? 0);

  // Fetch stored per-user counters
  const storedUserRows = await db
    .prepare('SELECT user_id, current_used_bytes FROM service_users WHERE service_id = ?')
    .bind(serviceId)
    .all<{ user_id: string; current_used_bytes: number }>();
  const storedUserMap: Record<string, number> = {};
  for (const row of storedUserRows.results ?? []) {
    storedUserMap[row.user_id] = Number(row.current_used_bytes);
  }

  const serviceDrift = realServiceBytes - storedServiceBytes;
  let serviceCorrected = false;

  if (serviceDrift !== 0 && !dryRun) {
    await db
      .prepare('UPDATE services SET current_used_bytes = ? WHERE id = ?')
      .bind(realServiceBytes, serviceId)
      .run();
    serviceCorrected = true;
  }

  let usersFixed = 0;
  for (const { user_id, used_bytes } of userUsageRows.results ?? []) {
    const realBytes = Number(used_bytes ?? 0);
    const storedBytes = storedUserMap[user_id] ?? 0;
    if (realBytes !== storedBytes) {
      if (!dryRun) {
        await db
          .prepare('UPDATE service_users SET current_used_bytes = ? WHERE service_id = ? AND user_id = ?')
          .bind(realBytes, serviceId, user_id)
          .run();
      }
      usersFixed++;
    }
  }

  return {
    service_drift_bytes: serviceDrift,
    service_corrected: !dryRun && serviceDrift !== 0,
    users_fixed: usersFixed,
    dry_run: dryRun,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/quota-reconciliation.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/services.ts apps/backend/test/quota-reconciliation.test.ts
git commit -m "feat(backend): add reconcileQuota to db/services"
```

---

### Task 3: Add `POST /admin/quota/reconcile` endpoint

**Files:**
- Modify: `apps/backend/src/routes/admin.ts`
- Modify: `apps/backend/test/quota-reconciliation.test.ts`

The endpoint is admin-only (already protected by `requireAdminMiddleware` on `/admin/*`).

Query param: `?dry_run=true` (default `false`).

- [ ] **Step 1: Write the failing test**

Add to `quota-reconciliation.test.ts`:

```typescript
import { Hono } from 'hono';
import admin from '../src/routes/admin';

function buildAdminApp(db: D1Database) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'admin-user' as WorkerVariables['userId']);
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/admin', admin);
  return { app, env: { usrc_d1: db } as unknown as CloudflareBindings };
}

describe('POST /admin/quota/reconcile', () => {
  it('returns 200 with reconcile report', async () => {
    const db = buildMockD1(1000, {}, 1000, {});
    const { app, env } = buildAdminApp(db);

    const res = await app.fetch(
      new Request('http://localhost/admin/quota/reconcile', { method: 'POST' }),
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { service_drift_bytes: number; dry_run: boolean };
    expect(typeof body.service_drift_bytes).toBe('number');
    expect(body.dry_run).toBe(false);
  });

  it('returns dry_run: true when ?dry_run=true', async () => {
    const db = buildMockD1(1000, {}, 500, {});
    const { app, env } = buildAdminApp(db);

    const res = await app.fetch(
      new Request('http://localhost/admin/quota/reconcile?dry_run=true', { method: 'POST' }),
      env
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { dry_run: boolean; service_drift_bytes: number };
    expect(body.dry_run).toBe(true);
    expect(body.service_drift_bytes).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter backend test test/quota-reconciliation.test.ts
```

Expected: FAIL — 404 because the endpoint doesn't exist.

- [ ] **Step 3: Add the endpoint to `routes/admin.ts`**

Add import at top of `apps/backend/src/routes/admin.ts`:

```typescript
import { reconcileQuota } from '../db/services';
```

Add the route (inside the `admin` Hono instance, after existing routes):

```typescript
admin.post('/quota/reconcile', async (c) => {
  const serviceId = c.get('serviceId');
  const dryRun = c.req.query('dry_run') === 'true';

  const result = await reconcileQuota(c.env.usrc_d1, serviceId, dryRun);

  if (!dryRun && (result.service_drift_bytes !== 0 || result.users_fixed > 0)) {
    c.executionCtx.waitUntil(
      logServiceEvent(c.env.usrc_d1, {
        serviceId,
        userId: c.get('userId'),
        action: 'quota_reconciled',
        resourceType: 'service',
        resourceId: serviceId,
        metadata: result,
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
      })
    );
  }

  return c.json(result);
});
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
pnpm --filter backend test test/quota-reconciliation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full backend test suite**

```bash
pnpm --filter backend test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/routes/admin.ts apps/backend/test/quota-reconciliation.test.ts
git commit -m "feat(backend): add POST /admin/quota/reconcile endpoint"
```
