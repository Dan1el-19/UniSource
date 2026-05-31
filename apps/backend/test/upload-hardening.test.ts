import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadRecord } from '../src/db/v1/files';
import type { ServiceRecord } from '../src/db/v1/services';

// Module mocks — must be declared before imports of the mocked modules
vi.mock('../src/services/r2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/r2')>();
  return {
    ...actual,
    headObject: vi.fn(),
    generatePresignedPutUrl: vi.fn().mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'key',
      expires_at: 9999999999,
    }),
    generatePresignedGetUrl: vi.fn(),
    deleteObject: vi.fn(),
  };
});

vi.mock('../src/services/appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/appwrite')>();
  return {
    ...actual,
    getAppwriteFileMeta: vi.fn(),
  };
});

vi.mock('../src/db/v1/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/v1/files')>();
  return {
    ...actual,
    getUpload: vi.fn(),
    getUploadForUser: vi.fn(),
    completeUpload: vi.fn(),
    completeUploadAndCreateFile: vi.fn().mockResolvedValue({ completed: true, alreadyCompleted: false }),
    failUpload: vi.fn(),
    createUpload: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../src/db/v1/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/v1/fileRecords')>();
  return { ...actual, createFileRecord: vi.fn(), createMainStorageFileRecord: vi.fn() };
});

vi.mock('../src/db/v1/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/v1/services')>();
  return {
    ...actual,
    releaseQuota: vi.fn(),
    logServiceEvent: vi.fn(),
    reserveQuota: vi.fn().mockResolvedValue({ ok: true }),
    ensureServiceUser: vi.fn(),
  };
});

import { generatePresignedPutUrl, headObject } from '../src/services/r2';
import { getAppwriteFileMeta } from '../src/services/appwrite';
import { createUpload, getUpload, failUpload, completeUpload, completeUploadAndCreateFile } from '../src/db/v1/files';
import { reserveQuota, releaseQuota, logServiceEvent, reserveMainStorageQuota, releaseMainStorageQuota } from '../src/db/v1/services';
import { v2ErrorHandler } from '../src/middleware/v2Errors';
import { createMainStorageFileRecord } from '../src/db/v1/fileRecords';
import upload from '../src/routes/v2/upload';
import publicRouter from '../src/routes/public';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pendingR2Record: UploadRecord = {
  id: 'upload-123',
  service_id: 'default',
  user_id: null,
  folder_id: null,
  filename: 'test.pdf',
  size: 1024,
  mime_type: 'application/pdf',
  destination: 'r2',
  storage_key: 'default/uploads/2026/01/01/upload-123.pdf',
  bucket: 'primary',
  status: 'pending',
  presigned_url: null,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000),
  is_main_storage: 0,
  upload_type: 'single',
  r2_upload_id: null,
};

function mockD1(changes = 1): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ meta: { changes }, results: [] }),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
  } as unknown as D1Database;
}

const baseEnv = {
  APP_DB: mockD1(),
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  APPWRITE_ENDPOINT: 'https://aw.test/v1',
  APPWRITE_PROJECT_ID: 'proj',
  APPWRITE_BUCKET_ID: 'bucket',
  APPWRITE_API_KEY: 'ak',
  SERVICE_API_KEY: 'test-api-key',
  SECONDARY_SERVICE_API_KEY: 'service-b-key',
} as unknown as CloudflareBindings;

const defaultServiceRecord: ServiceRecord = {
  id: 'default',
  name: 'primary',
  default_bucket: 'primary',
  max_storage_bytes: 16106127360,
  current_used_bytes: 0,
  main_used_bytes: 0,
  max_file_size_bytes: 5_368_709_120,
  recommended_upload_destination: 'r2',
  object_key_prefix: 'default',
  created_at: 0,
};

const secondaryServiceRecord: ServiceRecord = {
  id: 'service-b',
  name: 'Example Service B',
  default_bucket: 'service-b',
  max_storage_bytes: 107374182400,
  current_used_bytes: 0,
  main_used_bytes: 0,
  max_file_size_bytes: 2147483648,
  recommended_upload_destination: 'r2',
  object_key_prefix: '',
  created_at: 0,
};

function buildUploadApp(userId = 'system', serviceId = 'default') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.onError(v2ErrorHandler);
  const service = serviceId === 'default' ? defaultServiceRecord : secondaryServiceRecord;
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('service', service);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    c.set('apiKeyPermissions', ['admin'] as WorkerVariables['apiKeyPermissions']);
    await next();
  });
  app.route('/upload', upload);
  return app;
}

function buildPublicApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.onError(v2ErrorHandler);
  app.route('/public', publicRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Task 1: headObject
// ---------------------------------------------------------------------------

describe('headObject — R2 service', () => {
  it('is exported from services/r2', () => {
    expect(headObject).toBeDefined();
  });
});

describe('getAppwriteFileMeta — Appwrite service', () => {
  it('is exported from services/appwrite', () => {
    expect(getAppwriteFileMeta).toBeDefined();
  });
});

describe('POST /upload/complete — physical verification', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUpload).mockResolvedValue(pendingR2Record);
  });

  it('returns 409 and fails the upload when R2 object is not found', async () => {
    vi.mocked(headObject).mockResolvedValue(null);
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toContain('not found');
    expect(vi.mocked(failUpload)).toHaveBeenCalled();
  });

  it('returns 409 when R2 file size does not match expected', async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 512 }); // expected 1024
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toContain('size mismatch');
  });

  it('completes successfully when R2 object exists with correct size', async () => {
    vi.mocked(headObject).mockResolvedValue({ size: 1024 });
    vi.mocked(completeUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { item: { id: string; status: string; upload_type: string; file_id: string | null } };
    expect(body.item.status).toBe('completed');
    expect(body.item.id).toBe('upload-123');
    expect(body.item.upload_type).toBe('single');
    expect(vi.mocked(completeUpload)).toHaveBeenCalled();
  });

  it('uses the persisted upload main-storage flag when promoting a completed upload', async () => {
    vi.mocked(getUpload).mockResolvedValue({ ...pendingR2Record, is_main_storage: 1 });
    vi.mocked(headObject).mockResolvedValue({ size: 1024 });
    vi.mocked(completeUploadAndCreateFile).mockResolvedValue({ completed: true, alreadyCompleted: false });

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(completeUploadAndCreateFile)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ file: expect.objectContaining({ is_main_storage: true }) })
    );
  });
});

describe('POST /upload/r2/init', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('persists the main-storage flag on upload records', async () => {
    vi.mocked(generatePresignedPutUrl).mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'key',
      expires_at: 9999999999,
    });

    const app = buildUploadApp('u1');
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'firmware.bin',
          size: 1024,
          mime_type: 'application/octet-stream',
          is_main_storage: true,
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(201);
    expect(vi.mocked(createUpload)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ is_main_storage: true })
    );
  });

  it('uses the service-b R2 bucket for service-b uploads', async () => {
    vi.mocked(generatePresignedPutUrl).mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'key',
      expires_at: 9999999999,
    });

    const app = buildUploadApp('u1', 'service-b');
    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'photo.jpg',
          size: 1024,
          mime_type: 'image/jpeg',
          is_main_storage: true,
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(201);
    expect(vi.mocked(generatePresignedPutUrl)).toHaveBeenCalledWith(
      expect.anything(),
      'service-b',
      expect.stringMatching(/^uploads\//),
      'image/jpeg',
      expect.any(Number)
    );
  });
});

const pendingAppwriteRecord: UploadRecord = {
  id: 'upload-456',
  service_id: 'default',
  user_id: null,
  folder_id: null,
  filename: 'test.pdf',
  size: 1024,
  mime_type: 'application/pdf',
  destination: 'appwrite',
  storage_key: 'default/uploads/2026/01/01/abcdef123456789',
  bucket: 'appwrite-bucket-id',
  status: 'pending',
  presigned_url: null,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  is_main_storage: 0,
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000),
  upload_type: 'single',
  r2_upload_id: null,
};

describe('POST /upload/complete — physical verification (Appwrite)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getUpload).mockResolvedValue(pendingAppwriteRecord);
  });

  it('returns 409 and fails the upload when Appwrite file is not found', async () => {
    vi.mocked(getAppwriteFileMeta).mockResolvedValue(null);
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-456' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toContain('not found');
    expect(vi.mocked(failUpload)).toHaveBeenCalled();
  });

  it('returns 409 when Appwrite file size does not match expected', async () => {
    vi.mocked(getAppwriteFileMeta).mockResolvedValue({ size: 512 }); // expected 1024
    vi.mocked(failUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-456' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toContain('size mismatch');
  });

  it('completes successfully when Appwrite file exists with correct size', async () => {
    vi.mocked(getAppwriteFileMeta).mockResolvedValue({ size: 1024 });
    vi.mocked(completeUpload).mockResolvedValue(true);

    const app = buildUploadApp();
    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-456' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(200);
    const body = await res.json() as { item: { id: string; status: string; upload_type: string } };
    expect(body.item.status).toBe('completed');
    expect(body.item.id).toBe('upload-456');
    expect(vi.mocked(completeUpload)).toHaveBeenCalled();
  });
});

describe('POST /public/:slug/unlock — rate limiting', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    const rateLimitedEnv = {
      ...baseEnv,
      RL_SHARE_PASSWORD: { limit: vi.fn().mockResolvedValue({ success: false }) },
    } as unknown as CloudflareBindings;

    const app = buildPublicApp();
    const res = await app.fetch(
      new Request('http://localhost/public/any-slug/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'brute-force-attempt' }),
      }),
      rateLimitedEnv
    );

    expect(res.status).toBe(429);
  });

  it('proceeds past rate limiter when limit allows (returns 404 from missing share link)', async () => {
    const passEnv = {
      ...baseEnv,
      RL_SHARE_PASSWORD: { limit: vi.fn().mockResolvedValue({ success: true }) },
      APP_DB: mockD1(0),
    } as unknown as CloudflareBindings;

    const app = buildPublicApp();
    const res = await app.fetch(
      new Request('http://localhost/public/nonexistent/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test' }),
      }),
      passEnv
    );

    // 404 because share link not found in mock DB — but NOT 429
    expect(res.status).not.toBe(429);
    expect(res.status).toBe(404);
  });

  it('keys per (ip, slug) so two slugs from one IP do NOT share a counter', async () => {
    // Bug guard: previously the limiter keyed on IP only, so an attacker who
    // burned the limit on one slug got blocked on every other slug. Verify
    // each (ip, slug) pair gets its own bucket by inspecting the produced key.
    const limitMock = vi.fn().mockResolvedValue({ success: true });
    const passEnv = {
      ...baseEnv,
      RL_SHARE_PASSWORD: { limit: limitMock },
      APP_DB: mockD1(0),
    } as unknown as CloudflareBindings;

    const app = buildPublicApp();
    await app.fetch(
      new Request('http://localhost/public/slug-a/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
        body: JSON.stringify({ password: 'x' }),
      }),
      passEnv
    );
    await app.fetch(
      new Request('http://localhost/public/slug-b/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
        body: JSON.stringify({ password: 'x' }),
      }),
      passEnv
    );

    expect(limitMock).toHaveBeenCalledTimes(2);
    const keyA = (limitMock.mock.calls[0]![0] as { key: string }).key;
    const keyB = (limitMock.mock.calls[1]![0] as { key: string }).key;
    expect(keyA).not.toBe(keyB);
    expect(keyA).toMatch(/^share-password:/);
    expect(keyB).toMatch(/^share-password:/);
  });
});

describe('rate-limit policy bypass when binding missing', () => {
  it('lets requests through when no RL_* binding is configured (e.g. local dev)', async () => {
    // Same as the "limit allows" case but with NO binding at all — covers
    // the test/local-dev codepath where wrangler hasn't injected limiters.
    const noBindingEnv = { ...baseEnv, APP_DB: mockD1(0) } as unknown as CloudflareBindings;

    const app = buildPublicApp();
    const res = await app.fetch(
      new Request('http://localhost/public/nonexistent/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test' }),
      }),
      noBindingEnv
    );

    expect(res.status).not.toBe(429);
    expect(res.status).toBe(404);
  });
});

// ─── Task 5: Upload Permission Hardening ───────────────────────────────────────

function buildUploadAppWithPermissions(
  permissions: string[],
  serviceId = 'default',
  userId = 'system'
) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.onError(v2ErrorHandler);
  const service = serviceId === 'default' ? defaultServiceRecord : secondaryServiceRecord;
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('service', service);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    c.set('apiKeyPermissions', permissions as WorkerVariables['apiKeyPermissions']);
    await next();
  });
  app.route('/upload', upload);
  return app;
}

describe('API key permission enforcement on upload init', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 403 when API key lacks upload permission on R2 init', async () => {
    const app = buildUploadAppWithPermissions(['files:read']); // no 'upload'

    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('upload');
  });

  it('returns 403 when API key lacks upload permission on Appwrite init', async () => {
    const app = buildUploadAppWithPermissions(['files:read']);

    const res = await app.fetch(
      new Request('http://localhost/upload/appwrite/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('upload');
  });

  it('returns 403 when API key lacks upload permission on multipart create', async () => {
    const app = buildUploadAppWithPermissions(['files:read']);

    const res = await app.fetch(
      new Request('http://localhost/upload/r2/multipart/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('upload');
  });

  it('returns 403 when API key lacks upload permission on complete', async () => {
    const app = buildUploadAppWithPermissions(['files:read']);

    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(403);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toContain('upload');
  });

  it.each([
    ['sign multipart part', 'GET', '/upload/r2/multipart/sign-part?upload_id=upload-123&part_number=1', undefined],
    ['list multipart parts', 'GET', '/upload/r2/multipart/list-parts?upload_id=upload-123', undefined],
    ['complete multipart upload', 'POST', '/upload/r2/multipart/complete', { upload_id: 'upload-123', parts: [{ PartNumber: 1, ETag: 'etag1' }] }],
    ['abort multipart upload', 'DELETE', '/upload/r2/multipart/abort', { upload_id: 'upload-123' }],
  ])('returns 403 when API key lacks upload permission on %s', async (_name, method, path, body) => {
    const app = buildUploadAppWithPermissions(['files:read']);

    const res = await app.fetch(
      new Request(`http://localhost${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(403);
    const parsed = await res.json() as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe('forbidden');
    expect(parsed.error.message).toContain('upload');
  });

  it('allows R2 init when API key has upload permission', async () => {
    vi.mocked(generatePresignedPutUrl).mockResolvedValue({
      presigned_url: 'https://example.com/put',
      storage_key: 'key',
      expires_at: 9999999999,
    });
    vi.mocked(reserveQuota).mockResolvedValue({ ok: true });

    const app = buildUploadAppWithPermissions(['upload']);

    const res = await app.fetch(
      new Request('http://localhost/upload/r2/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'test.pdf',
          size: 1024,
          mime_type: 'application/pdf',
        }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(201);
  });
});

describe('Cross-service upload completion isolation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 404 when Service A tries to complete Service B upload (system caller)', async () => {
    // Upload belongs to service-b, but caller is serviceId=default
    vi.mocked(getUpload).mockResolvedValue({ ...pendingR2Record, service_id: 'service-b' });

    const app = buildUploadAppWithPermissions(['admin'], 'default', 'system');

    const res = await app.fetch(
      new Request('http://localhost/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toContain('Upload record not found');
  });

  it('returns 404 when Service A tries to fail Service B upload (system caller)', async () => {
    vi.mocked(getUpload).mockResolvedValue({ ...pendingR2Record, service_id: 'service-b' });

    const app = buildUploadAppWithPermissions(['admin'], 'default', 'system');

    const res = await app.fetch(
      new Request('http://localhost/upload/fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id: 'upload-123' }),
      }),
      { ...baseEnv, APP_DB: mockD1() }
    );

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
  });
});
