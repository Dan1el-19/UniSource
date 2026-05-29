import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { FILES_MAX_LIMIT } from '@unisource/sdk'
import { listFilesV2 } from '../../db/v2/files'
import {
  bulkTrashFileRecords,
  bulkRestoreFileRecords,
  bulkMoveFileRecords,
  deleteFileRecordPermanently,
  getFileRecordForUser,
  type BulkResult,
} from '../../db/fileRecords'
import { getFolderForUser } from '../../db/folders'
import { V2Error } from '../../lib/v2/errors'
import { getV2StorageUserId } from '../../lib/v2/principal'
import { logV2Request } from '../../lib/v2/log'
import { v2ValidationHook } from '../../lib/v2/zodHook'

type V2Env = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const querySchema = z.object({
  folder_id: z.string().optional().transform(v => {
    if (!v || v === '') return undefined
    if (v === 'null') return null
    return v
  }),
  search: z.string().trim().max(100, { message: 'search_too_long' }).optional(),
  mime_type: z.string().trim().toLowerCase().max(255).optional(),
  trash: z.enum(['active', 'trashed', 'all']).default('active'),
  sort_by: z.enum(['created_at', 'updated_at', 'name', 'size']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(FILES_MAX_LIMIT).default(25),
})

const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(100)

const filesBulkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('trash'), ids: bulkIdsSchema }),
  z.object({ action: z.literal('restore'), ids: bulkIdsSchema }),
  z.object({
    action: z.literal('move'),
    ids: bulkIdsSchema,
    folder_id: z.string().min(1).nullable(),
  }),
  z.object({ action: z.literal('delete'), ids: bulkIdsSchema }),
])

const filesV2 = new Hono<V2Env>()

filesV2.get('/', zValidator('query', querySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const query = c.req.valid('query')
  const userId = getV2StorageUserId(c, 'files:read')
  const serviceId = c.get('serviceId')
  const hmacSecret = c.env.CURSOR_HMAC_SECRET

  if (!hmacSecret) throw new V2Error('internal_error', 500, 'CURSOR_HMAC_SECRET not configured')

  const result = await listFilesV2(c.env.APP_DB, {
    user_id: userId,
    service_id: serviceId,
    folder_id: query.folder_id,
    trash: query.trash,
    search: query.search,
    mime_type: query.mime_type,
    sort_by: query.sort_by,
    sort_dir: query.sort_dir,
    limit: query.limit,
    cursor: query.cursor,
    hmacSecret,
  })

  const response = c.json({
    items: result.items,
    page: { limit: query.limit, next_cursor: result.next_cursor },
  })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'list' })
  return response
})

filesV2.post('/bulk', zValidator('json', filesBulkBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const body = c.req.valid('json')
  const requiredPermission = body.action === 'delete' || body.action === 'trash' || body.action === 'restore'
    ? 'files:delete'
    : 'files:read'
  const userId = getV2StorageUserId(c, requiredPermission)
  const serviceId = c.get('serviceId')

  let result: BulkResult

  if (body.action === 'trash') {
    result = await bulkTrashFileRecords(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'restore') {
    result = await bulkRestoreFileRecords(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'move') {
    if (body.folder_id !== null) {
      const targetFolder = await getFolderForUser(c.env.APP_DB, body.folder_id, userId, serviceId)
      if (!targetFolder) throw new V2Error('not_found', 404, 'Target folder not found')
      if (targetFolder.is_trashed) throw new V2Error('conflict', 409, 'Cannot move into a trashed folder')
    }
    result = await bulkMoveFileRecords(c.env.APP_DB, body.ids, userId, serviceId, body.folder_id)
  } else {
    // action === 'delete' — permanent
    const items: Array<{ id: string; ok: boolean; code?: 'not_found'; message?: string }> = []
    for (const id of body.ids) {
      const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId)
      if (!record) {
        items.push({ id, ok: false, code: 'not_found', message: 'File not found' })
        continue
      }
      await deleteFileRecordPermanently(c.env.APP_DB, id, userId, serviceId)
      items.push({ id, ok: true })
    }
    result = {
      processed: items.filter(i => i.ok).map(i => i.id),
      failed: items.filter(i => !i.ok).map(i => ({
        id: i.id, code: i.code as 'not_found', message: i.message ?? '',
      })),
    }
  }

  const response = c.json(result)
  logV2Request(c, start, { route_family: 'v2.files', operation: `bulk_${body.action}` })
  return response
})

export default filesV2
