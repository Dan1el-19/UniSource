import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

const { testFile, testFolder } = vi.hoisted(() => ({
  testFile: {
    id: 'file-1',
    service_id: 'default',
    user_id: 'user-test',
    folder_id: null,
    upload_id: null,
    filename: 'test.txt',
    size: 100,
    mime_type: 'text/plain',
    storage_destination: 'r2',
    storage_key: 'key',
    bucket: 'bucket',
    is_main_storage: 0,
    is_trashed: 0,
    trashed_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  testFolder: {
    id: 'folder-1',
    service_id: 'default',
    user_id: 'user-test',
    parent_id: null,
    name: 'Test Folder',
    color_tag: null,
    is_trashed: 0,
    trashed_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
}));

vi.mock('../src/db/fileRecords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/fileRecords')>();
  return {
    ...actual,
    listFileRecords: vi.fn().mockImplementation(() => Promise.resolve({ items: [testFile], next_cursor: null })),
    getFileRecordForUser: vi.fn().mockImplementation(() => Promise.resolve(testFile)),
    trashFileRecord: vi.fn().mockImplementation(() => Promise.resolve(true)),
    restoreFileRecord: vi.fn().mockImplementation(() => Promise.resolve(true)),
    deleteFileRecordPermanently: vi.fn().mockImplementation(() => Promise.resolve(true)),
    updateFileRecord: vi.fn().mockImplementation(() => Promise.resolve(testFile)),
    moveFileRecord: vi.fn().mockImplementation(() => Promise.resolve(true)),
  };
});

vi.mock('../src/db/folders', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/folders')>();
  return {
    ...actual,
    listFolders: vi.fn().mockImplementation(() => Promise.resolve({ items: [testFolder], next_cursor: null })),
    getFolderForUser: vi.fn().mockImplementation(() => Promise.resolve(testFolder)),
    createFolder: vi.fn().mockImplementation(() => Promise.resolve(testFolder)),
    updateFolder: vi.fn().mockImplementation(() => Promise.resolve(testFolder)),
    trashFolder: vi.fn().mockImplementation(() => Promise.resolve(true)),
    restoreFolder: vi.fn().mockImplementation(() => Promise.resolve(true)),
    getDescendantFolderIds: vi.fn().mockImplementation(() => Promise.resolve(['folder-1'])),
    trashFilesInFolders: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
  };
});

vi.mock('../src/db/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/services')>();
  return {
    ...actual,
    logServiceEvent: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
    releaseQuota: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
  };
});

vi.mock('../src/db/shareLinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/shareLinks')>();
  return {
    ...actual,
    deactivateShareLinksForFile: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
  };
});

vi.mock('../src/services/r2', () => ({
  deleteObject: vi.fn().mockImplementation(() => Promise.resolve(undefined)),
  generatePresignedGetUrl: vi.fn().mockImplementation(() => Promise.resolve({ presigned_url: 'https://r2.test/file', expires_at: 9999999999 })),
}));

vi.mock('../src/services/appwrite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/appwrite')>();
  return {
    ...actual,
    deleteAppwriteFile: vi.fn().mockImplementation(() => Promise.resolve({ deleted: true, not_found: false })),
    extractAppwriteFileIdFromStorageKey: vi.fn().mockImplementation(() => testFile.id),
  };
});

import { v2ErrorHandler } from '../src/middleware/v2Errors';
import myFilesRoute from '../src/routes/fileRecords';
import foldersRoute from '../src/routes/folders';

function mockD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        run: () => Promise.resolve({ meta: { changes: 1 }, results: [] }),
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
      }),
    }),
    batch: () => Promise.resolve([]),
  } as unknown as D1Database;
}

const testEnv = { APP_DB: mockD1() } as unknown as CloudflareBindings;

function buildMyFilesApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'x');
    c.set('userId', 'user-test');
    c.set('serviceId', 'default');
    c.set('authType', 'appwrite');
    c.set('isAdmin', false);
    c.set('serviceRole', 'user');
    await next();
  });
  app.onError(v2ErrorHandler);
  app.route('/my-files', myFilesRoute);
  return app;
}

function buildFoldersApp() {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'x');
    c.set('userId', 'user-test');
    c.set('serviceId', 'default');
    c.set('authType', 'appwrite');
    c.set('isAdmin', false);
    c.set('serviceRole', 'user');
    await next();
  });
  app.onError(v2ErrorHandler);
  app.route('/folders', foldersRoute);
  return app;
}

describe('shared route V2 response contract', () => {
  it('returns legacy list shape by default for /my-files', async () => {
    const app = buildMyFilesApp();
    const res = await app.fetch(
      new Request('http://localhost/my-files?limit=10', {
        headers: { 'X-Service-ID': 'default' },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('next_cursor');
    expect(body).toHaveProperty('limit');
    expect(body).not.toHaveProperty('page');
  });

  it('returns V2 list shape when V2 header is present for /my-files', async () => {
    const app = buildMyFilesApp();
    const res = await app.fetch(
      new Request('http://localhost/my-files?limit=10', {
        headers: {
          'X-Service-ID': 'default',
          'X-Unisource-API-Version': '2',
        },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items?: unknown[]; page?: { limit?: number; next_cursor?: string | null } };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.page).toMatchObject({ limit: expect.any(Number), next_cursor: null });
  });

  it('returns legacy single-resource shape by default for /folders/:id', async () => {
    const app = buildFoldersApp();
    const res = await app.fetch(
      new Request('http://localhost/folders/folder-1', {
        headers: { 'X-Service-ID': 'default' },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty('folder');
    expect(body).not.toHaveProperty('item');
  });

  it('returns V2 single-resource shape when V2 header is present for /folders/:id', async () => {
    const app = buildFoldersApp();
    const res = await app.fetch(
      new Request('http://localhost/folders/folder-1', {
        headers: {
          'X-Service-ID': 'default',
          'X-Unisource-API-Version': '2',
        },
      }),
      testEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { item?: Record<string, unknown> };
    expect(body).toHaveProperty('item');
    expect(body.item).toHaveProperty('id', 'folder-1');
  });
});
