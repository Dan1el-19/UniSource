import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  listFileRecordsV2,
  bulkTrashFileRecords,
  bulkRestoreFileRecords,
  bulkMoveFileRecords,
  type FileRecord,
} from '../../db/fileRecords';
import {
  fileRecordsListV2QuerySchema,
  bulkFileIdsSchema,
  bulkFileMoveRequestSchema,
  type FileRecordsListResponse,
  type BulkOperationResponse,
} from '@unisource/sdk';
import { getFolderForUser } from '../../db/folders';
import { logServiceEvent, releaseQuota } from '../../db/services';

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

// Maps internal FileRecord to public response — intentionally excludes storage_key and bucket
function mapFileRecord(record: FileRecord): import('@unisource/sdk').FileRecord {
  return {
    id: record.id,
    service_id: record.service_id,
    user_id: record.user_id,
    folder_id: record.folder_id,
    upload_id: record.upload_id,
    filename: record.filename,
    size: record.size,
    mime_type: record.mime_type,
    storage_destination: record.storage_destination,
    is_trashed: record.is_trashed === 1,
    trashed_at: record.trashed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

const filesV2 = new Hono<HonoEnv>();

// GET /v2/files
filesV2.get('/', zValidator('query', fileRecordsListV2QuerySchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const query = c.req.valid('query');

  try {
    const result = await listFileRecordsV2(c.env.APP_DB, {
      user_id: userId,
      service_id: serviceId,
      folder_id: query.folder_id,
      trashed_only: query.is_trashed,
      search: query.search,
      mime_type: query.mime_type,
      sort_by: query.sort_by,
      sort_dir: query.sort_dir,
      limit: query.limit ?? 25,
      cursor: query.cursor,
    });

    return c.json<FileRecordsListResponse>({
      items: result.items.map(mapFileRecord),
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

// POST /v2/files/bulk-trash
filesV2.post('/bulk-trash', zValidator('json', bulkFileIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids } = c.req.valid('json');

  const successIds = await bulkTrashFileRecords(c.env.APP_DB, ids, userId, serviceId);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

// POST /v2/files/bulk-restore
filesV2.post('/bulk-restore', zValidator('json', bulkFileIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids } = c.req.valid('json');

  const successIds = await bulkRestoreFileRecords(c.env.APP_DB, ids, userId, serviceId);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

// POST /v2/files/bulk-move
filesV2.post('/bulk-move', zValidator('json', bulkFileMoveRequestSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { ids, folder_id } = c.req.valid('json');

  if (folder_id) {
    const targetFolder = await getFolderForUser(c.env.APP_DB, folder_id, userId, serviceId);
    if (!targetFolder) {
      return c.json({ error: 'Not Found', message: 'Target folder not found' }, 404);
    }
    if (targetFolder.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot move files into a trashed folder' }, 409);
    }
  }

  const successIds = await bulkMoveFileRecords(c.env.APP_DB, ids, userId, serviceId, folder_id ?? null);
  const failedIds = ids.filter(id => !successIds.includes(id));

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  });
});

export default filesV2;
