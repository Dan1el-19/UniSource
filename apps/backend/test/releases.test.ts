import { describe, it, expect } from 'vitest';
import {
  createRelease,
  getRelease,
  completeRelease,
  failRelease,
  listReleases,
  updateRelease,
  deleteRelease,
  getLatestRelease,
} from '../src/db/releases';

function mockDbReturning(record: unknown, changes = 1): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: () => Promise.resolve({ meta: { changes }, results: [] }),
        first: () => Promise.resolve(record),
        all: () => Promise.resolve({ results: record ? (Array.isArray(record) ? record : [record]) : [] }),
      }),
    }),
  } as unknown as D1Database;
}

const baseRelease = {
  id: 'rel-1',
  service_id: 'usrc',
  name: 'v1.0.0',
  size: 4096,
  r2_key: 'releases/usrc/v1.0.0.zip',
  tags: '["stable"]',
  notes: null,
  force_update: 0,
  uploaded_by: 'user-abc',
  upload_status: 'completed',
  presigned_url: null,
  presigned_expires_at: null,
  created_at: 1000,
  updated_at: 1000,
};

describe('getRelease', () => {
  it('returns release by id', async () => {
    const db = mockDbReturning(baseRelease);
    const result = await getRelease(db, 'rel-1', 'usrc');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('rel-1');
  });

  it('returns null when not found', async () => {
    const db = mockDbReturning(null);
    const result = await getRelease(db, 'nonexistent', 'usrc');
    expect(result).toBeNull();
  });
});

describe('completeRelease', () => {
  it('returns true when update succeeds', async () => {
    const db = mockDbReturning(null, 1);
    const result = await completeRelease(db, 'rel-1');
    expect(result).toBe(true);
  });

  it('returns false when no rows affected (already completed)', async () => {
    const db = mockDbReturning(null, 0);
    const result = await completeRelease(db, 'rel-1');
    expect(result).toBe(false);
  });
});

describe('getLatestRelease', () => {
  it('returns the most recent completed release for a service', async () => {
    const db = mockDbReturning(baseRelease);
    const result = await getLatestRelease(db, 'usrc');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('v1.0.0');
  });
});

describe('listReleases', () => {
  it('returns paginated releases for a service', async () => {
    const db = mockDbReturning([baseRelease]);
    const result = await listReleases(db, 'usrc', { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.next_cursor).toBeNull();
  });
});
