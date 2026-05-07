import { describe, it, expect } from 'vitest';
import { createMainStorageFileRecord, listMainStorageFileRecords } from '../src/db/fileRecords';
import { reserveMainStorageQuota, releaseMainStorageQuota } from '../src/db/services';

function mockDbWithRecords(records: unknown[]): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: () => Promise.resolve({ meta: { changes: 1 }, results: [] }),
        all: () => Promise.resolve({ results: records }),
        first: () => Promise.resolve(records[0] ?? null),
      }),
    }),
  } as unknown as D1Database;
}

describe('createMainStorageFileRecord', () => {
  it('is exported from db/fileRecords', () => {
    expect(createMainStorageFileRecord).toBeDefined();
  });
});

describe('listMainStorageFileRecords', () => {
  it('returns files with is_main_storage=1', async () => {
    const fakeFile = {
      id: 'file-1',
      user_id: 'uploader',
      is_main_storage: 1,
      filename: 'shared.pdf',
      size: 2048,
      mime_type: 'application/pdf',
      storage_destination: 'r2',
      storage_key: 'main/shared.pdf',
      bucket: 'unisource',
      folder_id: null,
      is_trashed: 0,
      trashed_at: null,
      created_at: 1000,
      updated_at: 1000,
      service_id: 'default',
      upload_id: null,
    };
    const db = mockDbWithRecords([fakeFile]);
    const result = await listMainStorageFileRecords(db, 'default', { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('file-1');
  });
});

describe('reserveMainStorageQuota', () => {
  it('is exported from db/services', () => {
    expect(reserveMainStorageQuota).toBeDefined();
  });
});

describe('releaseMainStorageQuota', () => {
  it('is exported from db/services', () => {
    expect(releaseMainStorageQuota).toBeDefined();
  });
});
