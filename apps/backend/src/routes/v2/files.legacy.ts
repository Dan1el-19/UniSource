import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  bulkTrashFileRecords,
  bulkRestoreFileRecords,
  bulkMoveFileRecords,
} from '../../db/fileRecords'
import { bulkFileIdsSchema, bulkFileMoveRequestSchema } from '@unisource/sdk'
import { getFolderForUser } from '../../db/folders'
import { V2Error } from '../../lib/v2/errors'
import { logV2Request } from '../../lib/v2/log'
import { v2ValidationHook } from '../../lib/v2/zodHook'

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables }

const filesLegacy = new Hono<HonoEnv>()

// POST /v2/files/bulk-trash
filesLegacy.post('/bulk-trash', zValidator('json', bulkFileIdsSchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')

  const successIds = await bulkTrashFileRecords(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))

  const response = c.json({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'bulk_trash' })
  return response
})

// POST /v2/files/bulk-restore
filesLegacy.post('/bulk-restore', zValidator('json', bulkFileIdsSchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')

  const successIds = await bulkRestoreFileRecords(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))

  const response = c.json({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'bulk_restore' })
  return response
})

// POST /v2/files/bulk-move
filesLegacy.post('/bulk-move', zValidator('json', bulkFileMoveRequestSchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids, folder_id } = c.req.valid('json')

  if (folder_id) {
    const targetFolder = await getFolderForUser(c.env.APP_DB, folder_id, userId, serviceId)
    if (!targetFolder) {
      throw new V2Error('not_found', 404, 'Target folder not found')
    }
    if (targetFolder.is_trashed) {
      throw new V2Error('conflict', 409, 'Cannot move files into a trashed folder')
    }
  }

  const successIds = await bulkMoveFileRecords(c.env.APP_DB, ids, userId, serviceId, folder_id ?? null)
  const failedIds = ids.filter(id => !successIds.includes(id))

  const response = c.json({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'bulk_move' })
  return response
})

export default filesLegacy
