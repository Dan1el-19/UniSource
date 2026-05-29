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
  upsertReleaseSync,
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
  service_id: 'default',
  name: 'v1.0.0',
  size: 4096,
  r2_key: 'releases/default/v1.0.0.zip',
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
    const result = await getRelease(db, 'rel-1', 'default');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('rel-1');
  });

  it('returns null when not found', async () => {
    const db = mockDbReturning(null);
    const result = await getRelease(db, 'nonexistent', 'default');
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
    const result = await getLatestRelease(db, 'default');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('v1.0.0');
  });
});

describe('listReleases', () => {
  it('returns paginated releases for a service', async () => {
    const db = mockDbReturning([baseRelease]);
    const result = await listReleases(db, 'default', { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.next_cursor).toBeNull();
  });

  it('throws Invalid cursor for malformed cursor', async () => {
    const db = mockDbReturning([baseRelease])
    await expect(listReleases(db, 'default', { limit: 25, cursor: 'not-a-valid-cursor' })).rejects.toThrow('Invalid cursor')
  })

  it('throws Invalid cursor for non-numeric cursor timestamp', async () => {
    const db = mockDbReturning([baseRelease])
    await expect(listReleases(db, 'default', { limit: 25, cursor: 'abc:rel-1' })).rejects.toThrow('Invalid cursor')
  })
});

describe('upsertReleaseSync', () => {
  it('is exported and callable', async () => {
    const db = mockDbReturning(null, 1);
    await expect(
      upsertReleaseSync(db, {
        id: 'rel-sync-1',
        service_id: 'default',
        name: 'v2.0.0',
        size: 0,
        r2_key: 'releases/default/v2.0.0.zip',
        tags: ['stable'],
        notes: null,
        force_update: false,
        uploaded_by: 'system',
        presigned_url: '',
        presigned_expires_at: 0,
      })
    ).resolves.toBeUndefined();
  });
});
