import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createFolder,
  deleteFolderPermanently,
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
  type FolderCreateResponse,
  type FolderUpdateResponse,
  type FolderListResponse,
  type FolderDeleteResponse,
  type FolderRestoreResponse,
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
folders.post('/', zValidator('json', folderCreateRequestSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const body = c.req.valid('json');

  if (body.parent_id) {
    const parent = await getFolderForUser(c.env.usrc_d1, body.parent_id, userId, serviceId);
    if (!parent) {
      return c.json({ error: 'Not Found', message: 'Parent folder not found' }, 404);
    }
    if (parent.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot create folder inside a trashed folder' }, 409);
    }
  }

  const id = crypto.randomUUID();
  const folder = await createFolder(c.env.usrc_d1, {
    id,
    service_id: serviceId,
    user_id: userId,
    parent_id: body.parent_id ?? null,
    name: body.name,
    color_tag: body.color_tag ?? null,
  });

  return c.json<FolderCreateResponse>({ folder: mapFolder(folder) }, 201);
});

// List folders — with cursor pagination
folders.get('/', zValidator('query', listQuerySchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');

  try {
    const result = await listFolders(c.env.usrc_d1, {
      user_id: userId,
      service_id: serviceId,
      parent_id: query.parent_id ?? null,
      trashed_only: query.trashed_only,
      limit: query.limit,
      cursor: query.cursor,
    });

    return c.json<FolderListResponse>({
      items: result.items.map(mapFolder),
      next_cursor: result.next_cursor,
      limit: query.limit,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid cursor') {
      return c.json({ error: 'Bad Request', message: 'cursor is invalid' }, 400);
    }
    throw err;
  }
});

// Get single folder
folders.get('/:id', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const folder = await getFolderForUser(c.env.usrc_d1, id, userId, serviceId);
  if (!folder) {
    return c.json({ error: 'Not Found', message: 'Folder not found' }, 404);
  }

  return c.json({ folder: mapFolder(folder) });
});

// Update folder (rename / color)
folders.patch(
  '/:id',
  zValidator('param', folderIdParamSchema, validationErrorHook),
  zValidator('json', folderUpdateRequestSchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const updated = await updateFolder(c.env.usrc_d1, id, userId, serviceId, {
      name: body.name,
      color_tag: body.color_tag,
    });

    if (!updated) {
      return c.json({ error: 'Not Found', message: 'Folder not found or already trashed' }, 404);
    }

    return c.json<FolderUpdateResponse>({ folder: mapFolder(updated) });
  }
);

// Soft-delete (trash) or permanent delete
folders.delete('/:id', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');
  const permanent = c.req.query('permanent') === 'true';

  if (permanent) {
    // Get all descendant folder IDs (including this folder) via recursive CTE
    const descendantIds = await getDescendantFolderIds(c.env.usrc_d1, id, userId, serviceId);
    if (descendantIds.length === 0) {
      return c.json({ error: 'Not Found', message: 'Folder not found' }, 404);
    }

    // Mark all files in descendant folders as trashed (mark-for-deletion pattern).
    // Actual R2/Appwrite cleanup is handled by a Scheduled Worker cron job —
    // this avoids synchronous loops that could exceed Workers CPU limits on large folders.
    await trashFilesInFolders(c.env.usrc_d1, descendantIds, userId, serviceId);

    // Delete all descendant folders in D1 (FK cascade sets folder_id=NULL on surviving files)
    // Delete children first, then parent (reverse BFS order isn't needed because FK is SET NULL)
    for (const folderId of descendantIds) {
      await deleteFolderPermanently(c.env.usrc_d1, folderId, userId, serviceId);
    }

    c.executionCtx.waitUntil(
      logServiceEvent(c.env.usrc_d1, {
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

    return c.json<FolderDeleteResponse>({ success: true, id, permanent: true, folders_deleted: descendantIds.length });
  }

  const trashed = await trashFolder(c.env.usrc_d1, id, userId, serviceId);
  if (!trashed) {
    return c.json({ error: 'Not Found', message: 'Folder not found or already trashed' }, 404);
  }

  return c.json<FolderDeleteResponse>({ success: true, id, permanent: false });
});

// Restore folder from trash
folders.post('/:id/restore', zValidator('param', folderIdParamSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const restored = await restoreFolder(c.env.usrc_d1, id, userId, serviceId);
  if (!restored) {
    return c.json({ error: 'Not Found', message: 'Folder not found or not in trash' }, 404);
  }

  return c.json<FolderRestoreResponse>({ success: true, id });
});

export default folders;
