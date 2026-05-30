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
  restoreFileRecord,
  trashFileRecord,
  updateFileRecord,
  type FileRecord,
  type BulkResult,
} from '../../db/v1/fileRecords'
import { getFolderForUser } from '../../db/v1/folders'
import { logServiceEvent, releaseQuota } from '../../db/v1/services'
import { deleteObject, generatePresignedGetUrl } from '../../services/r2'
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  deleteAppwriteFile,
  extractAppwriteFileIdFromStorageKey,
} from '../../services/appwrite'
import { deactivateShareLinksForFile } from '../../db/v1/shareLinks'
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

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60

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
  }
}

const idParamSchema = z.object({ id: z.string().trim().min(1) })
const fileUpdateBodySchema = z.object({ filename: z.string().trim().min(1).max(255) })

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

// GET /files/:id
filesV2.get('/:id', zValidator('param', idParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const start = Date.now()
  const { id } = c.req.valid('param')

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId)
  if (!record) throw new V2Error('not_found', 404, 'File not found')

  const mapped = mapFileRecord(record)
  const response = c.json({ item: mapped })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'get' })
  return response
})

// PATCH /files/:id  { filename }
filesV2.patch(
  '/:id',
  zValidator('param', idParamSchema, v2ValidationHook),
  zValidator('json', fileUpdateBodySchema, v2ValidationHook),
  async (c) => {
    const userId = c.get('userId')
    const serviceId = c.get('serviceId')
    const start = Date.now()
    const { id } = c.req.valid('param')
    const { filename } = c.req.valid('json')

    const file = await updateFileRecord(c.env.APP_DB, id, userId, serviceId, { filename })
    if (!file) throw new V2Error('not_found', 404, 'File not found')

    const mapped = mapFileRecord(file)
    const response = c.json({ item: mapped })
    logV2Request(c, start, { route_family: 'v2.files', operation: 'update' })
    return response
  }
)

// DELETE /files/:id  ?permanent=bool
filesV2.delete('/:id', zValidator('param', idParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const start = Date.now()
  const { id } = c.req.valid('param')
  const permanent = c.req.query('permanent') === 'true'

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId)
  if (!record) throw new V2Error('not_found', 404, 'File not found')

  if (permanent) {
    try {
      if (record.storage_destination === 'r2') {
        await deleteObject(c.env, record.bucket, record.storage_key)
      } else {
        const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key)
        if (!appwriteFileId) throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key')
        await deleteAppwriteFile(c.env, record.bucket, appwriteFileId)
      }
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to delete file from storage')
    }

    await deactivateShareLinksForFile(c.env.APP_DB, id, serviceId)
    await deleteFileRecordPermanently(c.env.APP_DB, id, userId, serviceId)
    await releaseQuota(c.env.APP_DB, serviceId, record.size, record.user_id)

    c.executionCtx.waitUntil(
      logServiceEvent(c.env.APP_DB, {
        serviceId,
        userId,
        action: 'file_deleted',
        resourceType: 'file',
        resourceId: id,
        metadata: { filename: record.filename, size: record.size },
        ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        actorId: c.get('actorId') ?? null,
        targetUserId: c.get('actorId') ? c.get('userId') : null,
      })
    )

    const permResponse = c.json({ item: { id, deleted: true, permanent: true } })
    logV2Request(c, start, { route_family: 'v2.files', operation: 'delete' })
    return permResponse
  }

  const trashed = await trashFileRecord(c.env.APP_DB, id, userId, serviceId)
  if (!trashed) throw new V2Error('conflict', 409, 'File already in trash')

  const response = c.json({ item: { id, deleted: false, permanent: false } })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'delete' })
  return response
})

// POST /files/:id/restore
filesV2.post('/:id/restore', zValidator('param', idParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const start = Date.now()
  const { id } = c.req.valid('param')

  const restored = await restoreFileRecord(c.env.APP_DB, id, userId, serviceId)
  if (!restored) throw new V2Error('not_found', 404, 'File not found or not in trash')

  const response = c.json({ item: { id, restored: true } })
  logV2Request(c, start, { route_family: 'v2.files', operation: 'restore' })
  return response
})

// GET /files/:id/download-url
filesV2.get('/:id/download-url', zValidator('param', idParamSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const start = Date.now()
  const { id } = c.req.valid('param')

  const record = await getFileRecordForUser(c.env.APP_DB, id, userId, serviceId)
  if (!record) throw new V2Error('not_found', 404, 'File not found')
  if (record.is_trashed) throw new V2Error('conflict', 409, 'File is in trash')

  if (record.storage_destination === 'r2') {
    try {
      const { presigned_url, expires_at } = await generatePresignedGetUrl(
        c.env,
        record.bucket,
        record.storage_key,
        DOWNLOAD_URL_TTL_SECONDS,
        record.filename
      )
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      c.header('Pragma', 'no-cache')
      c.header('Expires', '0')
      const data = {
        upload_id: record.id,
        destination: record.storage_destination,
        download_url: presigned_url,
        expires_at,
      }
      const r2Response = c.json({ item: data })
      logV2Request(c, start, { route_family: 'v2.files', operation: 'download_url' })
      return r2Response
    } catch {
      throw new V2Error('bad_gateway', 502, 'Unable to generate R2 download URL')
    }
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(record.storage_key)
  if (!appwriteFileId) throw new V2Error('internal_error', 500, 'Invalid Appwrite storage key format')

  try {
    const token = await createAppwriteFileToken(c.env, record.bucket, appwriteFileId, DOWNLOAD_URL_TTL_SECONDS)
    const downloadUrl = buildAppwriteFileDownloadUrl(c.env, record.bucket, appwriteFileId, token.secret)
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    c.header('Pragma', 'no-cache')
    c.header('Expires', '0')
    const data = {
      upload_id: record.id,
      destination: record.storage_destination,
      download_url: downloadUrl,
      expires_at: token.expires_at,
    }
    const appwriteResponse = c.json({ item: data })
    logV2Request(c, start, { route_family: 'v2.files', operation: 'download_url' })
    return appwriteResponse
  } catch {
    throw new V2Error('bad_gateway', 502, 'Unable to generate Appwrite download URL')
  }
})

export default filesV2
