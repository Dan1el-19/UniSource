import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { V2Error, errorResponse } from '../src/lib/v2/errors';

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
    createMultipartRelease: vi.fn(),
    getReleaseMultipartContext: vi.fn(),
  };
});

vi.mock('../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/r2')>();
  return {
    ...actual,
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://r2.example.com/put',
      storage_key: 'releases/default/v1.0.0.zip',
      expires_at: 9999999999,
    }),
    headObject: vi.fn().mockResolvedValue({ size: 4096 }),
    deleteObject: vi.fn(),
    createMultipartUpload: vi.fn().mockResolvedValue({ upload_id: 'r2-upload-id' }),
    signUploadPart: vi.fn().mockResolvedValue({ url: 'https://r2.example.com/part-1', expires_at: 9999999999 }),
    listUploadedParts: vi.fn().mockResolvedValue([{ PartNumber: 1, ETag: 'etag-1', Size: 1024 }]),
    completeMultipartUpload: vi.fn().mockResolvedValue({ etag: 'complete-etag' }),
    abortMultipartUpload: vi.fn().mockResolvedValue(undefined),
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
  createMultipartRelease,
  getReleaseMultipartContext,
} from '../src/db/releases';
import { deleteObject, generatePresignedPutUrl, headObject, createMultipartUpload, signUploadPart, listUploadedParts, completeMultipartUpload, abortMultipartUpload } from '../src/services/r2';
import releasesRouter from '../src/routes/releases';

function buildReleasesApp(userId = 'system', isAdmin = true, serviceId = 'default') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', isAdmin as WorkerVariables['isAdmin']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('requestId', 'req-test');
    c.set('service', {
      id: serviceId,
      name: serviceId,
      default_bucket: serviceId === 'service-b' ? 'service-b' : 'primary',
      max_storage_bytes: 1000000000,
      current_used_bytes: 0,
      main_used_bytes: 0,
      max_file_size_bytes: 500000000,
      recommended_upload_destination: 'r2',
      object_key_prefix: serviceId === 'service-b' ? '' : serviceId,
      created_at: 0,
    } as WorkerVariables['service']);
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof V2Error) return errorResponse(c, err);
    throw err;
  });
  app.route('/releases', releasesRouter);
  return app;
}

const relEnv = {
  APP_DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run: vi.fn(), first: vi.fn(), all: vi.fn() })) })) },
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'sec',
  SERVICE_API_KEY: 'test-api-key',
  SECONDARY_SERVICE_API_KEY: 'service-b-key',
} as unknown as CloudflareBindings;

const completedRelease = {
  id: 'rel-1',
  service_id: 'default',
  name: 'v1.0.0',
  size: 4096,
  r2_key: 'releases/default/v1.0.0.zip',
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
    storage_key: 'releases/default/generated.zip',
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
    const body = await res.json() as { item: { presigned_url: string; release_id: string; r2_key: string; expires_at: number } };
    expect(body.item.presigned_url).toBe('https://r2.example.com/put');
    expect(body.item.r2_key).toBe('releases/default/app.zip');
    expect(createRelease).toHaveBeenCalledWith(
      relEnv.APP_DB,
      expect.objectContaining({
        id: body.item.release_id,
        service_id: 'default',
        name: 'v1.0.0',
        r2_key: body.item.r2_key,
        tags: [],
        force_update: false,
      })
    );
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      relEnv,
      'primary',
      body.item.r2_key,
      'application/octet-stream',
      3600
    );
  });

  it('does not prefix release keys with service id for service-b bucket', async () => {
    const app = buildReleasesApp('system', true, 'service-b');
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'v1.0.0', filename: 'app.zip', tags: [], force_update: false }),
      }),
      relEnv
    );

    expect(res.status).toBe(201);
    const body = await res.json() as { item: { r2_key: string } };
    expect(body.item.r2_key).toBe('releases/app.zip');
    expect(generatePresignedPutUrl).toHaveBeenCalledWith(
      relEnv,
      'service-b',
      'releases/app.zip',
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
    const body = await res.json() as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.request_id).toBe('req-test');
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
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
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
    const body = await res.json() as { item: { id: string; status: string } };
    expect(body.item).toEqual({ id: 'rel-1', status: 'completed' });
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
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('conflict');
    expect(failRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1');
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
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('conflict');
    expect(failRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1');
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
    const body = await res.json() as { item: { id: string; status: string } };
    expect(body.item).toEqual({ id: 'rel-1', status: 'completed' });
    expect(updateRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1', 'default', { size: 4096 });
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
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
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
    const body = await res.json() as { item: { id: string; status: string } };
    expect(body.item).toEqual({ id: 'rel-1', status: 'failed' });
    expect(failRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1');
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
    const body = await res.json() as { item: { status: string } };
    expect(body.item.status).toBe('failed');
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
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toBe('Release is already in state: completed');
    expect(failRelease).not.toHaveBeenCalled();
  });
});

describe('POST /releases/upload/multipart/create', () => {
  it('returns 201 with upload_id and r2_upload_id', async () => {
    vi.mocked(createMultipartUpload).mockResolvedValue({ upload_id: 'r2-upload-id' });
    vi.mocked(createMultipartRelease).mockResolvedValue({ ...completedRelease, upload_status: 'pending' });
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/multipart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'v1.0.0', filename: 'app.zip' }),
      }),
      relEnv
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { item: { upload_id: string; r2_upload_id: string } };
    expect(body.item.r2_upload_id).toBe('r2-upload-id');
  });
});

describe('GET /releases/upload/multipart/sign-part', () => {
  it('returns 200 with presigned part URL', async () => {
    vi.mocked(signUploadPart).mockResolvedValue({ url: 'https://r2.example.com/part-1', expires_at: 9999999999 });
    vi.mocked(getReleaseMultipartContext).mockResolvedValue({
      release_id: 'rel-1',
      service_id: 'default',
      r2_key: 'releases/default/v1.0.0.zip',
      r2_upload_id: 'r2-up-1',
      upload_status: 'pending',
    });
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/multipart/sign-part?upload_id=rel-1&part_number=1'),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { item: { url: string } };
    expect(body.item.url).toBe('https://r2.example.com/part-1');
  });
});

describe('GET /releases/upload/multipart/list-parts', () => {
  it('returns 200 with V2 page envelope', async () => {
    vi.mocked(getReleaseMultipartContext).mockResolvedValue({
      release_id: 'rel-1',
      service_id: 'default',
      r2_key: 'releases/default/v1.0.0.zip',
      r2_upload_id: 'r2-up-1',
      upload_status: 'pending',
    });
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/multipart/list-parts?upload_id=rel-1'),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; page: { limit: number; next_cursor: string | null } };
    expect(body.page).toEqual({ limit: 1000, next_cursor: null });
  });
});

describe('POST /releases/upload/multipart/complete', () => {
  it('returns 200 with completed status', async () => {
    vi.mocked(getReleaseMultipartContext).mockResolvedValue({
      release_id: 'rel-1',
      service_id: 'default',
      r2_key: 'releases/default/v1.0.0.zip',
      r2_upload_id: 'r2-up-1',
      upload_status: 'pending',
    });
    vi.mocked(completeMultipartUpload).mockResolvedValue({ etag: 'complete-etag' });
    vi.mocked(completeRelease).mockResolvedValue(true);
    vi.mocked(updateRelease).mockResolvedValue(completedRelease);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'rel-1', parts: [{ PartNumber: 1, ETag: 'etag-1' }] }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { item: { id: string; status: string } };
    expect(body.item.status).toBe('completed');
  });
});

describe('DELETE /releases/upload/multipart/abort', () => {
  it('returns 200 with failed status', async () => {
    vi.mocked(abortMultipartUpload).mockResolvedValue(undefined);
    vi.mocked(getReleaseMultipartContext).mockResolvedValue({
      release_id: 'rel-1',
      service_id: 'default',
      r2_key: 'releases/default/v1.0.0.zip',
      r2_upload_id: 'r2-up-1',
      upload_status: 'pending',
    });
    vi.mocked(failRelease).mockResolvedValue(true);
    const app = buildReleasesApp();
    const res = await app.fetch(
      new Request('http://localhost/releases/upload/multipart/abort', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'rel-1' }),
      }),
      relEnv
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { item: { id: string; status: string } };
    expect(body.item.status).toBe('failed');
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
    expect(deleteObject).toHaveBeenCalledWith(relEnv, 'primary', completedRelease.r2_key);
    expect(deleteRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1', 'default');
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
    expect(updateRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-1', 'default', {
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
              r2_key: 'releases/default/rel-sync.zip',
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
      relEnv.APP_DB,
      expect.objectContaining({
        id: 'rel-sync',
        service_id: 'default',
        name: 'v1.2.0',
        r2_key: 'releases/default/rel-sync.zip',
        size: 1234,
      })
    );
    expect(completeRelease).toHaveBeenCalledWith(relEnv.APP_DB, 'rel-sync');
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
              r2_key: 'backups/default/rel-sync.zip',
              size: 1234,
            },
          ],
        }),
      }),
      relEnv
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { message: string };
    expect(body.message).toBe('r2_key must start with releases/default/');
    expect(upsertReleaseSync).not.toHaveBeenCalled();
    expect(completeRelease).not.toHaveBeenCalled();
  });

  it('accepts release sync keys without service id prefix for service-b bucket', async () => {
    vi.mocked(completeRelease).mockResolvedValue(true);
    const app = buildReleasesApp('system', true, 'service-b');
    const res = await app.fetch(
      new Request('http://localhost/releases/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releases: [
            {
              id: 'rel-sync',
              name: 'v1.2.0',
              r2_key: 'releases/rel-sync.zip',
              size: 1234,
            },
          ],
        }),
      }),
      relEnv
    );

    expect(res.status).toBe(200);
    expect(upsertReleaseSync).toHaveBeenCalledWith(
      relEnv.APP_DB,
      expect.objectContaining({
        service_id: 'service-b',
        r2_key: 'releases/rel-sync.zip',
      })
    );
  });
});

import { requireAdminMiddleware } from '../src/middleware/admin';

describe('releases routes — admin enforcement', () => {
  it('returns 403 for non-admin JWT user', async () => {
    const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
    app.use('*', async (c, next) => {
      c.set('userId', 'user-123' as WorkerVariables['userId']);
      c.set('authType', 'jwt' as WorkerVariables['authType']);
      c.set('isAdmin', false as WorkerVariables['isAdmin']);
      c.set('service', {
        id: 'default',
        name: 'default',
        default_bucket: 'primary',
        max_storage_bytes: 1000000000,
        current_used_bytes: 0,
        main_used_bytes: 0,
        max_file_size_bytes: 500000000,
        recommended_upload_destination: 'r2',
        object_key_prefix: 'default',
        created_at: 0,
      } as WorkerVariables['service']);
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
