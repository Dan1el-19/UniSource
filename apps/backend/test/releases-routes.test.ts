import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/db/releases', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/releases')>();
  return {
    ...actual,
    createRelease: vi.fn(),
    getRelease: vi.fn(),
    completeRelease: vi.fn(),
    failRelease: vi.fn(),
    listReleases: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    updateRelease: vi.fn(),
    deleteRelease: vi.fn(),
    getLatestRelease: vi.fn(),
    upsertReleaseSync: vi.fn(),
  };
});

vi.mock('../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/r2')>();
  return {
    ...actual,
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://r2.example.com/put',
      storage_key: 'releases/usrc/v1.0.0.zip',
      expires_at: 9999999999,
    }),
    headObject: vi.fn().mockResolvedValue({ size: 4096 }),
    deleteObject: vi.fn(),
  };
});

import {
  listReleases,
  createRelease,
  getRelease,
  completeRelease,
  failRelease,
  getLatestRelease,
  updateRelease,
  deleteRelease,
  upsertReleaseSync,
} from '../src/db/releases';
import { deleteObject, generatePresignedPutUrl, headObject } from '../src/services/r2';
import releasesRouter from '../src/routes/releases';

function buildReleasesApp(userId = 'system', isAdmin = true) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/releases', releasesRouter);
  return app;
}

const relEnv = {
  usrc_d1: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn(), first: vi.fn(), all: vi.fn() })) })) },
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'sec',
  USRC_API_KEY: 'test-api-key',
  BLOKSERWIS_API_KEY: 'blok-key',
} as unknown as CloudflareBindings;

const completedRelease = {
  id: 'rel-1',
  service_id: 'usrc',
  name: 'v1.0.0',
  size: 4096,
  r2_key: 'releases/usrc/v1.0.0.zip',
  tags: [],
  notes: null,
  force_update: false,
  uploaded_by: 'system',
  upload_status: 'completed' as const,
  created_at: new Date().toISOString(),
};

const pendingRelease = { ...completedRelease, upload_status: 'pending' as const };
const failedRelease = { ...completedRelease, upload_status: 'failed' as const };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listReleases).mockResolvedValue({ items: [], next_cursor: null });
  vi.mocked(createRelease).mockImplementation(async (_db, input) => ({
    id: input.id,
    service_id: input.service_id,
    name: input.name,
    size: input.size,
    r2_key: input.r2_key,
    tags: input.tags,
    notes: input.notes ?? null,
    force_update: input.force_update ?? false,
    uploaded_by: input.uploaded_by,
    upload_status: 'pending',
    created_at: new Date(0).toISOString(),
  }));
  vi.mocked(generatePresignedPutUrl).mockResolvedValue({
    presigned_url: 'https://r2.example.com/put',
    storage_key: 'releases/usrc/generated.zip',
    expires_at: 9999999999,
  });
  vi.mocked(headObject).mockResolvedValue({ size: 4096 });
});

describe('GET /releases', () => {
  it('returns 200 with empty list', async () => {
    vi.mocked(listReleases).mockResolvedValue({ items: [], next_cursor: null });
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases'), relEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});

describe('POST /releases/upload/init', () => {
  it('returns 201 with presigned URL and release_id', async () => {
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'v1.0.0', filename: 'app.zip', tags: [], force_update: false }),
      }),
      relEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { presigned_url: string; release_id: string; r2_key: string };
    expect(body.presigned_url).toBe('https://r2.example.com/put');
    expect(body.r2_key).toBe(`releases/usrc/${body.release_id}.zip`);
    expect(createRelease).toHaveBeenCalledWith(
      relEnv.usrc_d1,
      expect.objectContaining({
        id: body.release_id,
        service_id: 'usrc',
        name: 'v1.0.0',
        r2_key: body.r2_key,
        tags: [],
        force_update: false,
      })
    );
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      relEnv,
      'unisource',
      body.r2_key,
      'application/octet-stream',
      3600
    );
  });

  it('returns 400 for missing name', async () => {
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'app.zip' }),
      }),
      relEnv
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /releases/upload/complete', () => {
  it('returns 404 when release does not exist', async () => {
    vi.mocked(getRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'missing', size: 4096 }),
      }),
      relEnv
    );
    expect(res.status).toBe(404);
  });

  it('returns success when release is already completed', async () => {
    vi.mocked(getRelease).mockResolvedValue(completedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1', size: 4096 }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    expect(headObject).not.toHaveBeenCalled();
  });

  it('returns 409 when R2 object not found', async () => {
    vi.mocked(getRelease).mockResolvedValue(pendingRelease);
    vi.mocked(headObject).mockResolvedValue(null);
    vi.mocked(failRelease).mockResolvedValue(true);

    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1', size: 4096 }),
      }),
      relEnv
    );
    expect(res.status).toBe(409);
    expect(failRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1');
  });

  it('returns 409 and fails release when uploaded object size does not match requested size', async () => {
    vi.mocked(getRelease).mockResolvedValue(pendingRelease);
    vi.mocked(headObject).mockResolvedValue({ size: 2048 });
    vi.mocked(failRelease).mockResolvedValue(true);

    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1', size: 4096 }),
      }),
      relEnv
    );
    expect(res.status).toBe(409);
    expect(failRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1');
    expect(completeRelease).not.toHaveBeenCalled();
    expect(updateRelease).not.toHaveBeenCalled();
  });

  it('returns 200 when R2 exists', async () => {
    vi.mocked(getRelease).mockResolvedValue(pendingRelease);
    vi.mocked(headObject).mockResolvedValue({ size: 4096 });
    vi.mocked(completeRelease).mockResolvedValue(true);
    vi.mocked(updateRelease).mockResolvedValue(completedRelease);

    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1', size: 4096 }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(updateRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1', 'usrc', { size: 4096 });
  });
});

describe('POST /releases/upload/fail', () => {
  it('returns 404 when release does not exist', async () => {
    vi.mocked(getRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'missing' }),
      }),
      relEnv
    );
    expect(res.status).toBe(404);
  });

  it('marks a release failed', async () => {
    vi.mocked(getRelease).mockResolvedValue(pendingRelease);
    vi.mocked(failRelease).mockResolvedValue(true);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1' }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    expect(failRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1');
  });

  it('returns success when release is already failed', async () => {
    vi.mocked(getRelease).mockResolvedValue(failedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1' }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('failed');
    expect(failRelease).not.toHaveBeenCalled();
  });

  it('returns 409 with actual state when release is completed', async () => {
    vi.mocked(getRelease).mockResolvedValue(completedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: 'rel-1' }),
      }),
      relEnv
    );
    expect(res.status).toBe(409);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('Release is already in state: completed');
    expect(failRelease).not.toHaveBeenCalled();
  });
});

describe('GET /releases/latest', () => {
  it('returns 404 when no completed release exists', async () => {
    vi.mocked(getLatestRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases/latest'), relEnv);
    expect(res.status).toBe(404);
  });

  it('returns 200 with the latest release', async () => {
    vi.mocked(getLatestRelease).mockResolvedValue(completedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases/latest'), relEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe('rel-1');
  });
});

describe('GET /releases/:id', () => {
  it('returns 404 for missing release', async () => {
    vi.mocked(getRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases/nonexistent'), relEnv);
    expect(res.status).toBe(404);
  });

  it('returns 200 for existing release', async () => {
    vi.mocked(getRelease).mockResolvedValue(completedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(new Request('http://localhost/releases/rel-1'), relEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string };
    expect(body.id).toBe('rel-1');
  });
});

describe('DELETE /releases/:id', () => {
  it('returns 404 for missing release', async () => {
    vi.mocked(getRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/nonexistent', { method: 'DELETE' }),
      relEnv
    );
    expect(res.status).toBe(404);
  });

  it('deletes R2 object for completed releases before deleting DB record', async () => {
    vi.mocked(getRelease).mockResolvedValue(completedRelease);
    vi.mocked(deleteRelease).mockResolvedValue(true);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/rel-1', { method: 'DELETE' }),
      relEnv
    );
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith(relEnv, 'unisource', completedRelease.r2_key);
    expect(deleteRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1', 'usrc');
  });
});

describe('PATCH /releases/:id', () => {
  it('updates release fields', async () => {
    vi.mocked(updateRelease).mockResolvedValue({ ...completedRelease, notes: 'patched' });
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/rel-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'patched', force_update: true }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    expect(updateRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-1', 'usrc', {
      notes: 'patched',
      force_update: true,
    });
  });

  it('returns 404 for missing release', async () => {
    vi.mocked(updateRelease).mockResolvedValue(null);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/missing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'patched' }),
      }),
      relEnv
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /releases/sync', () => {
  it('creates and completes manifests', async () => {
    vi.mocked(completeRelease).mockResolvedValue(true);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releases: [
            {
              id: 'rel-sync',
              name: 'v1.2.0',
              r2_key: 'releases/usrc/rel-sync.zip',
              size: 1234,
              tags: ['stable'],
              notes: 'synced',
              force_update: true,
            },
          ],
        }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { synced: number };
    expect(body.synced).toBe(1);
    expect(upsertReleaseSync).toHaveBeenCalledWith(
      relEnv.usrc_d1,
      expect.objectContaining({
        id: 'rel-sync',
        service_id: 'usrc',
        name: 'v1.2.0',
        r2_key: 'releases/usrc/rel-sync.zip',
        size: 1234,
      })
    );
    expect(completeRelease).toHaveBeenCalledWith(relEnv.usrc_d1, 'rel-sync');
  });

  it('returns 400 and does not create release when manifest r2_key is outside service releases prefix', async () => {
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releases: [
            {
              id: 'rel-sync',
              name: 'v1.2.0',
              r2_key: 'backups/usrc/rel-sync.zip',
              size: 1234,
            },
          ],
        }),
      }),
      relEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('r2_key must start with releases/usrc/');
    expect(upsertReleaseSync).not.toHaveBeenCalled();
    expect(completeRelease).not.toHaveBeenCalled();
  });
});

import { requireAdminMiddleware } from '../src/middleware/admin';

describe('releases routes — admin enforcement', () => {
  it('returns 403 for non-admin JWT user', async () => {
    const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
    app.use('*', async (c, next) => {
      c.set('userId', 'user-123' as WorkerVariables['userId']);
      c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
      c.set('authType', 'jwt' as WorkerVariables['authType']);
      c.set('isAdmin', false as WorkerVariables['isAdmin']);
      await next();
    });
    app.use('/releases/*', requireAdminMiddleware);
    app.route('/releases', releasesRouter);

    const res = await app.fetch(
      new Request('http://localhost/releases'),
      relEnv
    );
    expect(res.status).toBe(403);
  });
});
