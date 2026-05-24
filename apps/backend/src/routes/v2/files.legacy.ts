import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  bulkTrashFileRecords,
  bulkRestoreFileRecords,
  bulkMoveFileRecords,
} from '../../db/fileRecords'
import {
  bulkFileIdsSchema,
  bulkFileMoveRequestSchema,
  type BulkOperationResponse,
} from '@unisource/sdk'
import { getFolderForUser } from '../../db/folders'

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables }

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (value: unknown, status?: number) => Response }
) {
  if (result.success) return
  const firstIssue = result.error?.issues[0]
  const issuePath = firstIssue?.path.length ? `${firstIssue.path.join('.')}: ` : ''
  return c.json(
    { error: 'Bad Request', message: `${issuePath}${firstIssue?.message ?? 'Validation failed'}` },
    400
  )
}

const filesLegacy = new Hono<HonoEnv>()

// POST /v2/files/bulk-trash
filesLegacy.post('/bulk-trash', zValidator('json', bulkFileIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')

  const successIds = await bulkTrashFileRecords(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

// POST /v2/files/bulk-restore
filesLegacy.post('/bulk-restore', zValidator('json', bulkFileIdsSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')

  const successIds = await bulkRestoreFileRecords(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

// POST /v2/files/bulk-move
filesLegacy.post('/bulk-move', zValidator('json', bulkFileMoveRequestSchema, validationErrorHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids, folder_id } = c.req.valid('json')

  if (folder_id) {
    const targetFolder = await getFolderForUser(c.env.APP_DB, folder_id, userId, serviceId)
    if (!targetFolder) {
      return c.json({ error: 'Not Found', message: 'Target folder not found' }, 404)
    }
    if (targetFolder.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot move files into a trashed folder' }, 409)
    }
  }

  const successIds = await bulkMoveFileRecords(c.env.APP_DB, ids, userId, serviceId, folder_id ?? null)
  const failedIds = ids.filter(id => !successIds.includes(id))

  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

export default filesLegacy
