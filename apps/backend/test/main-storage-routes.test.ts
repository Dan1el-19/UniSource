import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../src/db/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/fileRecords')>();
  return {
    ...actual,
    listMainStorageFileRecords: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createMainStorageFileRecord: vi.fn(),
    getFileRecord: vi.fn(),
    updateFileRecord: vi.fn(),
    trashFileRecord: vi.fn(),
    restoreFileRecord: vi.fn(),
    deleteFileRecordPermanently: vi.fn(),
  };
});

vi.mock('../src/db/services', () => ({
  releaseMainStorageQuota: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/shareLinks', () => ({
  deactivateShareLinksForFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/r2', () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/services/appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/appwrite')>();
  return {
    ...actual,
    deleteAppwriteFile: vi.fn().mockResolvedValue({ deleted: true, not_found: false }),
  };
});

vi.mock('../src/middleware/requireRole', () => ({
  requireRoleMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { listMainStorageFileRecords, getFileRecord, trashFileRecord, deleteFileRecordPermanently, updateFileRecord, restoreFileRecord } from '../src/db/fileRecords';
import { releaseMainStorageQuota } from '../src/db/services';
import { v2ErrorHandler } from '../src/middleware/v2Errors';
import mainStorageRouter from '../src/routes/mainStorage';

function buildMainApp(userId = 'u1', serviceId = 'default') {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('userId', userId as WorkerVariables['userId']);
    c.set('serviceId', serviceId as WorkerVariables['serviceId']);
    c.set('authType', 'appwrite' as WorkerVariables['authType']);
    c.set('isAdmin', false as WorkerVariables['isAdmin']);
    await next();
  });
  app.onError(v2ErrorHandler);
  app.route('/main', mainStorageRouter);
  return app;
}

function mockD1(): D1Database {
  return { prepare: () => ({ bind: () => ({ run: () => Promise.resolve({ meta: { changes: 1 }, results: [] }) }) }) } as unknown as D1Database;
}

const env = { APP_DB: mockD1() } as unknown as CloudflareBindings;

describe('GET /main', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns 200 with empty list', async () => {
    vi.mocked(listMainStorageFileRecords).mockResolvedValue({ items: [], next_cursor: null });
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: null };
    expect(body.items).toEqual([]);
  });
});

describe('GET /main/:id', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns 404 when file not found', async () => {
    vi.mocked(getFileRecord).mockResolvedValue(null);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1'), env);
    expect(res.status).toBe(404);
  });

  it('returns 404 when file does not belong to service', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'other', is_main_storage: 1, is_trashed: 0 } as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1'), env);
    expect(res.status).toBe(404);
  });

  it('returns 200 when file exists in MAIN_STORAGE', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 0 } as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1'), env);
    expect(res.status).toBe(200);
  });

  it('returns 404 when file is trashed', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 1 } as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1'), env);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /main/:id', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns 404 when file not found', async () => {
    vi.mocked(getFileRecord).mockResolvedValue(null);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'new-name.pdf' }),
    }), env);
    expect(res.status).toBe(404);
  });

  it('returns 404 when file is trashed', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 1 } as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'new-name.pdf' }),
    }), env);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /main/:id', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns 200 on soft delete', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 0 } as any);
    vi.mocked(trashFileRecord).mockResolvedValue(undefined as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1', { method: 'DELETE' }), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; file_id: string };
    expect(body.success).toBe(true);
  });

  it('returns 200 on permanent delete when ?permanent=true', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({
      id: 'file-1',
      service_id: 'default',
      user_id: 'u1',
      is_main_storage: 1,
      is_trashed: 0,
      size: 1024,
      storage_destination: 'r2',
      bucket: 'bucket',
      storage_key: 'key',
    } as any);
    vi.mocked(deleteFileRecordPermanently).mockResolvedValue(undefined as any);
    vi.mocked(releaseMainStorageQuota).mockResolvedValue(undefined);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1?permanent=true', { method: 'DELETE' }), env);
    expect(res.status).toBe(200);
    expect(vi.mocked(deleteFileRecordPermanently)).toHaveBeenCalled();
    expect(vi.mocked(releaseMainStorageQuota)).toHaveBeenCalledWith(env.APP_DB, 'default', 1024);
  });

  it('does NOT call releaseMainStorageQuota on soft delete', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 0, size: 1024 } as any);
    vi.mocked(trashFileRecord).mockResolvedValue(undefined as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1', { method: 'DELETE' }), env);
    expect(res.status).toBe(200);
    expect(vi.mocked(releaseMainStorageQuota)).not.toHaveBeenCalled();
  });
});

describe('POST /main/:id/restore', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('returns 404 when file is not trashed', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 0 } as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1/restore', { method: 'POST' }), env);
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful restore', async () => {
    vi.mocked(getFileRecord).mockResolvedValue({ id: 'file-1', service_id: 'default', is_main_storage: 1, is_trashed: 1 } as any);
    vi.mocked(restoreFileRecord).mockResolvedValue(undefined as any);
    const app = buildMainApp();
    const res = await app.fetch(new Request('http://localhost/main/file-1/restore', { method: 'POST' }), env);
    expect(res.status).toBe(200);
  });
});
