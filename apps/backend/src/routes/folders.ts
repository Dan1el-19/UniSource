import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createFolder,
  deleteFolderPermanently,
  getFolderForUser,
  listFolders,
  restoreFolder,
  trashFolder,
  updateFolder,
  type FolderRecord,
} from '../db/folders';
import {
  folderCreateRequestSchema,
  folderUpdateRequestSchema,
  type FolderListResponse,
  type FolderResponse,
} from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

function validationErrorHook(
  result: {
    success: boolean;
    error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> };
  },
  c: { json: (value: unknown, status?: number) => Response }
) {
  if (result.success) return;
  const firstIssue = result.error?.issues[0];
  const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : '';
  return c.json(
    { error: 'Bad Request', message: `${issuePath}${firstIssue?.message ?? 'Validation failed'}` },
    400
  );
}

const folderIdParamSchema = z.object({ id: z.string().trim().min(1) });

function mapFolder(folder: FolderRecord): FolderResponse {
  return {
    id: folder.id,
    user_id: folder.user_id,
    parent_id: folder.parent_id,
    name: folder.name,
    color_tag: folder.color_tag,
    is_trashed: folder.is_trashed === 1,
    trashed_at: folder.trashed_at,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  };
}

const folders = new Hono<HonoEnv>();

// Create folder
folders.post('/', zValidator('json', folderCreateRequestSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');

  if (body.parent_id) {
    const parent = await getFolderForUser(c.env.APP_DB, body.parent_id, userId);
    if (!parent) {
      return c.json({ error: 'Not Found', message: 'Parent folder not found' }, 404);
    }
    if (parent.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot create folder inside a trashed folder' }, 409);
    }
  }

  const id = crypto.randomUUID();
  const folder = await createFolder(c.env.APP_DB, {
    id,
    user_id: userId,
    parent_id: body.parent_id ?? null,
    name: body.name,
    color_tag: body.color_tag ?? null,
  });

  return c.json<FolderResponse>(mapFolder(folder), 201);
});

// List folders (root or children of parent_id)
folders.get('/', async (c) => {
  const userId = c.get('userId');
  const rawParentId = c.req.query('parent_id');
  const trashedOnly = c.req.query('trashed') === 'true';

  const parentId = rawParentId?.trim() || null;
  const items = await listFolders(c.env.APP_DB, userId, parentId ?? undefined, trashedOnly);

  return c.json<FolderListResponse>({ items: items.map(mapFolder) });
});

// Get single folder
folders.get('/:id', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const { id } = c.req.valid('param');

  const folder = await getFolderForUser(c.env.APP_DB, id, userId);
  if (!folder) {
    return c.json({ error: 'Not Found', message: 'Folder not found' }, 404);
  }

  return c.json<FolderResponse>(mapFolder(folder));
});

// Update folder (rename / color)
folders.patch(
  '/:id',
  zValidator('param', folderIdParamSchema, validationErrorHook),
  zValidator('json', folderUpdateRequestSchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updated = await updateFolder(c.env.APP_DB, id, userId, {
      name: body.name,
      color_tag: body.color_tag,
    });

    if (!updated) {
      return c.json({ error: 'Not Found', message: 'Folder not found or already trashed' }, 404);
    }

    return c.json<FolderResponse>(mapFolder(updated));
  }
);

// Soft-delete folder (trash) — or permanent with ?permanent=true
folders.delete('/:id', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  if (permanent) {
    const deleted = await deleteFolderPermanently(c.env.APP_DB, id, userId);
    if (!deleted) {
      return c.json({ error: 'Not Found', message: 'Folder not found' }, 404);
    }
    return c.json({ success: true, id, permanent: true });
  }

  const trashed = await trashFolder(c.env.APP_DB, id, userId);
  if (!trashed) {
    return c.json({ error: 'Not Found', message: 'Folder not found or already trashed' }, 404);
  }

  return c.json({ success: true, id, permanent: false });
});

// Restore folder from trash
folders.post('/:id/restore', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const { id } = c.req.valid('param');

  const restored = await restoreFolder(c.env.APP_DB, id, userId);
  if (!restored) {
    return c.json({ error: 'Not Found', message: 'Folder not found or not in trash' }, 404);
  }

  return c.json({ success: true, id });
});

export default folders;
