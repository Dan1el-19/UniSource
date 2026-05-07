import { Hono } from 'hono';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UploadRecord } from '../src/db/files';

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

vi.mock('../src/db/files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/files')>();
  return {
    ...actual,
    getUpload: vi.fn(),
    getUploadForUser: vi.fn(),
    completeUpload: vi.fn(),
    failUpload: vi.fn(),
    createUpload: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('../src/db/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/fileRecords')>();
  return { ...actual, createFileRecord: vi.fn() };
});

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return {
    ...actual,
    releaseQuota: vi.fn(),
    logServiceEvent: vi.fn(),
    reserveQuota: vi.fn().mockResolvedValue({ ok: true }),
    ensureServiceUser: vi.fn(),
  };
});

import { headObject } from '../src/services/r2';
import { getAppwriteFileMeta } from '../src/services/appwrite';
import { getUpload, failUpload, completeUpload } from '../src/db/files';
import upload from '../src/routes/upload';
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
  bucket: 'unisource',
  status: 'pending',
  presigned_url: null,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000),
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
  BLOKSERWIS_API_KEY: 'blok-api-key',
} as unknown as CloudflareBindings;

function buildUploadApp(userId = 'system', serviceId = 'default') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('authType', 'apikey' as WorkerVariables['authType']);
    c.set('isAdmin', true as WorkerVariables['isAdmin']);
    await next();
  });
  app.route('/upload', upload);
  return app;
}

function buildPublicApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
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
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Conflict');
    expect(body.message).toContain('not found');
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
    const body = await res.json() as { message: string };
    expect(body.message).toContain('size mismatch');
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
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(vi.mocked(completeUpload)).toHaveBeenCalled();
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
  created_at: Math.floor(Date.now() / 1000),
  updated_at: Math.floor(Date.now() / 1000),
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
    const body = await res.json() as { error: string; message: string };
    expect(body.error).toBe('Conflict');
    expect(body.message).toContain('not found');
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
    const body = await res.json() as { message: string };
    expect(body.message).toContain('size mismatch');
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
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(vi.mocked(completeUpload)).toHaveBeenCalled();
  });
});

describe('POST /public/:slug/unlock — rate limiting', () => {
  it('returns 429 when rate limit is exceeded', async () => {
    const rateLimitedEnv = {
      ...baseEnv,
      RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) },
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
      RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
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
});
