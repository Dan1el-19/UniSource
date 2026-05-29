import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createFolder,
  getDescendantFolderIds,
  getFolderForUser,
  listFolders,
  restoreFolder,
  trashFolder,
  updateFolder,
  type FolderRecord,
} from '../db/folders';
import { trashFilesInFolders } from '../db/fileRecords';
import { logServiceEvent } from '../db/services';
import {
  FILES_DEFAULT_LIMIT,
  FILES_MAX_LIMIT,
  folderCreateRequestSchema,
  folderUpdateRequestSchema,
  type Folder,
} from '@unisource/sdk';
import { V2Error } from '../lib/v2/errors';
import { logV2Request } from '../lib/v2/log';
import { v2ValidationHook } from '../lib/v2/zodHook';
import { listOrLegacy, itemOrLegacy, actionOrLegacy } from '../lib/v2/responses';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const folderIdParamSchema = z.object({ id: z.string().trim().min(1) });

const listQuerySchema = z
  .object({
    limit: z.string().optional(),
    cursor: z.string().optional(),
    parent_id: z.string().optional(),
    trashed: z.string().optional(),
    is_trashed: z.string().optional(),
  })
  .transform((v) => {
    const trashed = v.trashed ?? v.is_trashed;
    return {
      limit: v.limit !== undefined ? Number(v.limit) : FILES_DEFAULT_LIMIT,
      cursor: v.cursor?.trim() || undefined,
      parent_id: v.parent_id?.trim() || undefined,
      trashed_only: trashed === 'true',
    };
  })
  .superRefine((v, ctx) => {
    if (!Number.isInteger(v.limit) || v.limit < 1 || v.limit > FILES_MAX_LIMIT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['limit'],
        message: `limit must be between 1 and ${FILES_MAX_LIMIT}`,
      });
    }
  });

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

const folders = new Hono<HonoEnv>();

// Create folder
folders.post('/', zValidator('json', folderCreateRequestSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const body = c.req.valid('json');
  const start = Date.now();

  if (body.parent_id) {
    const parent = await getFolderForUser(c.env.APP_DB, body.parent_id, userId, serviceId);
    if (!parent) {
      throw new V2Error('not_found', 404, 'Parent folder not found');
    }
    if (parent.is_trashed) {
      throw new V2Error('conflict', 409, 'Cannot create folder inside a trashed folder');
    }
  }

  const id = crypto.randomUUID();
  const folder = await createFolder(c.env.APP_DB, {
    id,
    service_id: serviceId,
    user_id: userId,
    parent_id: body.parent_id ?? null,
    name: body.name,
    color_tag: body.color_tag ?? null,
  });

  const mapped = mapFolder(folder);
  const response = c.json(itemOrLegacy(c, mapped, { folder: mapped }), 201);
  logV2Request(c, start, { route_family: 'folders', operation: 'create' });
  return response;
});

// List folders — with cursor pagination
folders.get('/', zValidator('query', listQuerySchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');
  const start = Date.now();

  try {
    const result = await listFolders(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      parent_id: query.parent_id ?? null,
      trashed_only: query.trashed_only,
      limit: query.limit,
      cursor: query.cursor,
    });

    const response = c.json(listOrLegacy(c, result.items.map(mapFolder), {
      limit: query.limit,
      next_cursor: result.next_cursor,
    }));
    logV2Request(c, start, { route_family: 'folders', operation: 'list' });
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      throw new V2Error('cursor_invalid', 400);
    }
    throw err;
  }
});

// Get single folder
folders.get('/:id', zValidator('param', folderIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const start = Date.now();

  const folder = await getFolderForUser(c.env.APP_DB, id, userId, serviceId);
  if (!folder) {
    throw new V2Error('not_found', 404, 'Folder not found');
  }

  const mapped = mapFolder(folder);
  const response = c.json(itemOrLegacy(c, mapped, { folder: mapped }));
  logV2Request(c, start, { route_family: 'folders', operation: 'get' });
  return response;
});

// Update folder (rename / color)
folders.patch(
  '/:id',
  zValidator('param', folderIdParamSchema, v2ValidationHook),
  zValidator('json', folderUpdateRequestSchema, v2ValidationHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const start = Date.now();

    const updated = await updateFolder(c.env.APP_DB, id, userId, serviceId, {
      name: body.name,
      color_tag: body.color_tag,
    });

    if (!updated) {
      throw new V2Error('not_found', 404, 'Folder not found or already trashed');
    }

    const mapped = mapFolder(updated);
    const response = c.json(itemOrLegacy(c, mapped, { folder: mapped }));
    logV2Request(c, start, { route_family: 'folders', operation: 'update' });
    return response;
  }
);

// Soft-delete (trash) or permanent delete
folders.delete('/:id', zValidator('param', folderIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';
  const start = Date.now();

  if (permanent) {
    // Get all descendant folder IDs (including this folder) via recursive CTE
    const descendantIds = await getDescendantFolderIds(c.env.APP_DB, id, userId, serviceId);
    if (descendantIds.length === 0) {
      throw new V2Error('not_found', 404, 'Folder not found');
    }

    // Mark all files in descendant folders as trashed (mark-for-deletion pattern).
    // Actual R2/Appwrite cleanup is handled by R2 lifecycle rules — backend
    // does not own physical cleanup of trashed files anymore (B4).
    await trashFilesInFolders(c.env.APP_DB, descendantIds, userId, serviceId);

    // B11: delete all descendant folders in a single D1 batch instead of
    // sequential per-folder DELETEs. Children-first iteration order keeps
    // the recursive CTE consistent with FK semantics.
    const deleteStmts = descendantIds.map((folderId) =>
      c.env.APP_DB
        .prepare('DELETE FROM folders WHERE id = ? AND user_id = ? AND service_id = ?')
        .bind(folderId, userId, serviceId)
    );
    if (deleteStmts.length > 0) {
      await c.env.APP_DB.batch(deleteStmts);
    }

    c.executionCtx.waitUntil(
      logServiceEvent(c.env.APP_DB, {
        serviceId,
        userId,
        action: 'folder_deleted',
        resourceType: 'folder',
        resourceId: id,
        metadata: { descendants_deleted: descendantIds.length },
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        actorId: c.get('actorId') ?? null,
        targetUserId: c.get('actorId') ? c.get('userId') : null,
      })
    );

    const response = c.json(actionOrLegacy(c,
      { id, deleted: true, permanent: true, folders_deleted: descendantIds.length },
      { success: true, id, permanent: true, folders_deleted: descendantIds.length }
    ));
    logV2Request(c, start, { route_family: 'folders', operation: 'delete' });
    return response;
  }

  const trashed = await trashFolder(c.env.APP_DB, id, userId, serviceId);
  if (!trashed) {
    throw new V2Error('not_found', 404, 'Folder not found or already trashed');
  }

  const response = c.json(actionOrLegacy(c,
    { id, deleted: false, permanent: false },
    { success: true, id, permanent: false }
  ));
  logV2Request(c, start, { route_family: 'folders', operation: 'delete' });
  return response;
});

// Restore folder from trash
folders.post('/:id/restore', zValidator('param', folderIdParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const start = Date.now();

  const restored = await restoreFolder(c.env.APP_DB, id, userId, serviceId);
  if (!restored) {
    throw new V2Error('not_found', 404, 'Folder not found or not in trash');
  }

  const response = c.json(actionOrLegacy(c,
    { id, restored: true },
    { success: true, id }
  ));
  logV2Request(c, start, { route_family: 'folders', operation: 'restore' });
  return response;
});

export default folders;
