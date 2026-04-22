import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import folders from '../src/routes/folders';

type FolderRow = {
  id: string;
  service_id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  color_tag: string | null;
  is_trashed: 0 | 1;
  trashed_at: number | null;
  created_at: number;
  updated_at: number;
};

const trashedFolder: FolderRow = {
  id: 'folder-trash-1',
  service_id: 'usrc',
  user_id: 'user-1',
  parent_id: null,
  name: 'Kosz test',
  color_tag: null,
  is_trashed: 1,
  trashed_at: 1_800_000_050,
  created_at: 1_800_000_000,
  updated_at: 1_800_000_050,
};

function buildFoldersApp(db: D1Database) {
  const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

  app.use('*', async (c, next) => {
    c.set('serviceId', 'usrc' as WorkerVariables['serviceId']);
    c.set('userId', 'user-1' as WorkerVariables['userId']);
    c.set('authType', 'jwt' as WorkerVariables['authType']);
    await next();
  });

  app.route('/folders', folders);

  return { app, env: { usrc_d1: db } as unknown as CloudflareBindings };
}

function mockFoldersDb(): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        all: () =>
          Promise.resolve({
            results: sql.includes('is_trashed = 1') ? [trashedFolder] : [],
          }),
      }),
    }),
  } as unknown as D1Database;
}

describe('GET /folders query aliases', () => {
  it('accepts canonical trashed=true', async () => {
    const { app, env } = buildFoldersApp(mockFoldersDb());

    const response = await app.fetch(new Request('http://localhost/folders?trashed=true&limit=10'), env);
    const payload = await response.json<{
      items: Array<{ id: string; is_trashed: boolean }>;
      next_cursor: string | null;
      limit: number;
    }>();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ id: trashedFolder.id, is_trashed: true });
  });

  it('accepts deprecated is_trashed=true alias with the same result', async () => {
    const { app, env } = buildFoldersApp(mockFoldersDb());

    const response = await app.fetch(new Request('http://localhost/folders?is_trashed=true&limit=10'), env);
    const payload = await response.json<{
      items: Array<{ id: string; is_trashed: boolean }>;
      next_cursor: string | null;
      limit: number;
    }>();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({ id: trashedFolder.id, is_trashed: true });
  });
});
