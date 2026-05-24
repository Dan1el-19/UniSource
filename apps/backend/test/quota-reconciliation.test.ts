import { describe, it, expect } from 'vitest';
import { reconcileQuota } from '../src/db/services';

// Minimal D1 mock that simulates real quota drift
function buildMockD1(serviceUsage: number, userUsages: Record<string, number>, storedServiceBytes: number, storedUserBytes: Record<string, number>): D1Database {
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
            const rows = Object.entries(storedUserBytes).map(([user_id, current_used_bytes]) => ({ user_id, current_used_bytes }));
            return Promise.resolve({ results: rows });
          }
          return Promise.resolve({ results: [] });
        },
        first: () => {
          // SUM(size) for the whole service (no GROUP BY)
          if (sql.includes('SUM(size)') && !sql.includes('GROUP BY')) {
            return Promise.resolve({ used_bytes: serviceUsage });
          }
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
    const result = await reconcileQuota(db, 'default', true); // dry_run = true
    expect(result.service_drift_bytes).toBe(2000); // 5000 - 3000
    expect(result.users_fixed).toBe(0);
  });

  it('detects no drift when counters are accurate', async () => {
    const db = buildMockD1(3000, { 'user-1': 3000 }, 3000, { 'user-1': 3000 });
    const result = await reconcileQuota(db, 'default', true);
    expect(result.service_drift_bytes).toBe(0);
    expect(result.users_fixed).toBe(0);
  });

  it('detects per-user drift', async () => {
    const db = buildMockD1(3000, { 'user-1': 1500, 'user-2': 1500 }, 3000, { 'user-1': 1000, 'user-2': 1500 });
    const result = await reconcileQuota(db, 'default', true);
    expect(result.users_fixed).toBe(1); // user-1 has 500 byte drift
  });

  it('applies corrections when dry_run is false', async () => {
    const db = buildMockD1(5000, {}, 3000, {});
    const result = await reconcileQuota(db, 'default', false);
    expect(result.service_drift_bytes).toBe(2000);
    expect(result.service_corrected).toBe(true);
  });

  it('zeros out counter for user with no active files', async () => {
    const db = buildMockD1(0, {}, 0, { 'user-ghost': 500 });
    const result = await reconcileQuota(db, 'default', true);
    expect(result.users_fixed).toBe(1);
  });
});
