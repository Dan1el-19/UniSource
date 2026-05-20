import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  listFoldersV2,
  getFolderBreadcrumbs,
  bulkTrashFolders,
  bulkRestoreFolders,
  bulkMoveFolders,
  getFolderForUser,
  type FolderRecord,
} from '../../db/folders';
import {
  folderListV2QuerySchema,
  bulkFolderIdsSchema,
  bulkFolderMoveRequestSchema,
  type FolderListResponse,
  type BulkOperationResponse,
  type FolderBreadcrumbsResponse,
  type Folder,
} from '@unisource/sdk';
import { z } from 'zod';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
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

function mapFolder(folder: FolderRecord): Folder {
  return {
    id: folder.id,
    service_id: folder.service_id,
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

const foldersV2 = new Hono<HonoEnv>();
const folderIdParamSchema = z.object({ id: z.string().trim().min(1) });

// GET /v2/folders
foldersV2.get('/', zValidator('query', folderListV2QuerySchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');

  try {
    const result = await listFoldersV2(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      parent_id: query.parent_id,
      trashed_only: query.is_trashed,
      search: query.search,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });

    return c.json<FolderListResponse>({
      items: result.items.map(mapFolder),
      next_cursor: result.next_cursor,
      limit: query.limit ?? 25,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
    }
    throw err;
  }
});

// GET /v2/folders/:id/breadcrumbs
foldersV2.get('/:id/breadcrumbs', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const folder = await getFolderForUser(c.env.APP_DB, id, userId, serviceId);
  if (!folder) {
    return c.json({ error: 'Not Found', message: 'Folder not found' }, 404);
  }

  const breadcrumbs = await getFolderBreadcrumbs(c.env.APP_DB, id, userId, serviceId);
  return c.json<FolderBreadcrumbsResponse>({ breadcrumbs: breadcrumbs.map(mapFolder) });
});

// POST /v2/folders/bulk-trash
foldersV2.post('/bulk-trash', zValidator('json', bulkFolderIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids } = c.req.valid('json');

  const successIds = await bulkTrashFolders(c.env.APP_DB, ids, userId, serviceId);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

// POST /v2/folders/bulk-restore
foldersV2.post('/bulk-restore', zValidator('json', bulkFolderIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids } = c.req.valid('json');

  const successIds = await bulkRestoreFolders(c.env.APP_DB, ids, userId, serviceId);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

// POST /v2/folders/bulk-move
foldersV2.post('/bulk-move', zValidator('json', bulkFolderMoveRequestSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids, parent_id } = c.req.valid('json');

  if (parent_id) {
    const targetFolder = await getFolderForUser(c.env.APP_DB, parent_id, userId, serviceId);
    if (!targetFolder) {
      return c.json({ error: 'Not Found', message: 'Target folder not found' }, 404);
    }
    if (targetFolder.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot move folders into a trashed folder' }, 409);
    }
    if (ids.includes(parent_id)) {
      return c.json({ error: 'Conflict', message: 'Cannot move a folder into itself' }, 409);
    }

    // Cycle prevention: Check if the target parent_id is a descendant of ANY of the folders being moved
    for (const folderId of ids) {
      const descendants = await getDescendantFolderIds(c.env.APP_DB, folderId, userId, serviceId);
      if (descendants.includes(parent_id)) {
        return c.json({ error: 'Conflict', message: 'Cannot move a folder into its own descendant (cycle detected)' }, 409);
      }
    }
  }

  const successIds = await bulkMoveFolders(c.env.APP_DB, ids, userId, serviceId, parent_id ?? null);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

export default foldersV2;
