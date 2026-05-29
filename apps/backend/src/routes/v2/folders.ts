import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { LIST_MAX_LIMIT } from '@unisource/sdk'
import { listFoldersV2 } from '../../db/v2/folders'
import type { FolderRowV2 } from '../../db/v2/folders'
import { V2Error } from '../../lib/v2/errors'
import { logV2Request } from '../../lib/v2/log'
import { v2ValidationHook } from '../../lib/v2/zodHook'
import { getV2StorageUserId } from '../../lib/v2/principal'

import {
  getFolderBreadcrumbs,
  bulkTrashFolders,
  bulkRestoreFolders,
  bulkMoveFolders,
  getFolderForUser,
  getDescendantFolderIds,
  type FolderRecord,
} from '../../db/folders'
import { trashFilesInFolders } from '../../db/fileRecords'
import type { BulkResult } from '../../db/fileRecords'

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables }

// ─── GET /v2/folders — v2 standard ─────────────────────────────────────────

const querySchema = z.object({
  parent_id: z.string().optional().transform(v => {
    if (!v || v === '') return undefined
    if (v === 'null') return null
    return v
  }),
  search: z.string().trim().max(100, { message: 'search_too_long' }).optional(),
  trash: z.enum(['active', 'trashed', 'all']).default('active'),
  sort_by: z.enum(['created_at', 'updated_at', 'name']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).default(25),
})

const bulkIdsSchema = z.array(z.string().min(1)).min(1).max(100)

const foldersBulkBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('trash'), ids: bulkIdsSchema }),
  z.object({ action: z.literal('restore'), ids: bulkIdsSchema }),
  z.object({
    action: z.literal('move'),
    ids: bulkIdsSchema,
    parent_id: z.string().min(1).nullable(),
  }),
  z.object({ action: z.literal('delete'), ids: bulkIdsSchema }),
])

const foldersV2 = new Hono<HonoEnv>()

foldersV2.get('/', zValidator('query', querySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const query = c.req.valid('query')
  const userId = getV2StorageUserId(c, 'files:read')
  const serviceId = c.get('serviceId')
  const hmacSecret = c.env.CURSOR_HMAC_SECRET

  if (!hmacSecret) throw new V2Error('internal_error', 500, 'CURSOR_HMAC_SECRET not configured')

  const result = await listFoldersV2(c.env.APP_DB, {
    user_id: userId,
    service_id: serviceId,
    parent_id: query.parent_id,
    trash: query.trash,
    search: query.search,
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
  logV2Request(c, start, { route_family: 'v2.folders', operation: 'list' })
  return response
})

// ─── Bulk operations ────────────────────────────────────────────────────────

const folderIdParamSchema = z.object({ id: z.string().trim().min(1) })

// v2 mapper — FolderRecord (DB row) → FolderRowV2 (public response shape)
// color_tag '' is normalised to null (matches db/v2/folders.ts)
function mapFolderV2(folder: FolderRecord): FolderRowV2 {
  return {
    id: folder.id,
    service_id: folder.service_id,
    user_id: folder.user_id,
    parent_id: folder.parent_id,
    name: folder.name,
    color_tag: folder.color_tag === '' ? null : folder.color_tag,
    is_trashed: folder.is_trashed === 1,
    trashed_at: folder.trashed_at,
    created_at: folder.created_at,
    updated_at: folder.updated_at,
  }
}

foldersV2.get('/:id/breadcrumbs', zValidator('param', folderIdParamSchema, v2ValidationHook), async (c) => {
  const userId = getV2StorageUserId(c, 'files:read')
  const serviceId = c.get('serviceId')
  const { id } = c.req.valid('param')

  const folder = await getFolderForUser(c.env.APP_DB, id, userId, serviceId)
  if (!folder) {
    throw new V2Error('not_found', 404, 'Folder not found')
  }

  const breadcrumbs = await getFolderBreadcrumbs(c.env.APP_DB, id, userId, serviceId)
  return c.json({ breadcrumbs: breadcrumbs.map(mapFolderV2) })
})

foldersV2.post('/bulk', zValidator('json', foldersBulkBodySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const body = c.req.valid('json')
  const requiredPermission = body.action === 'delete' || body.action === 'trash' || body.action === 'restore'
    ? 'files:delete'
    : 'files:read'
  const userId = getV2StorageUserId(c, requiredPermission)
  const serviceId = c.get('serviceId')

  let result: BulkResult

  if (body.action === 'trash') {
    result = await bulkTrashFolders(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'restore') {
    result = await bulkRestoreFolders(c.env.APP_DB, body.ids, userId, serviceId)
  } else if (body.action === 'move') {
    if (body.parent_id !== null) {
      const target = await getFolderForUser(c.env.APP_DB, body.parent_id, userId, serviceId)
      if (!target) throw new V2Error('not_found', 404, 'Target parent folder not found')
      if (target.is_trashed) throw new V2Error('conflict', 409, 'Cannot move into a trashed folder')
    }
    result = await bulkMoveFolders(c.env.APP_DB, body.ids, userId, serviceId, body.parent_id)
  } else {
    // action === 'delete' — permanent delete subtree per id
    const items: Array<{ id: string; ok: boolean; code?: 'not_found' | 'conflict'; message?: string }> = []
    for (const id of body.ids) {
      const descendants = await getDescendantFolderIds(c.env.APP_DB, id, userId, serviceId)
      if (descendants.length === 0) {
        items.push({ id, ok: false, code: 'not_found', message: 'Folder not found' })
        continue
      }
      // Mark files trashed (R2 cleanup via lifecycle), batch-delete folders
      await trashFilesInFolders(c.env.APP_DB, descendants, userId, serviceId)
      const stmts = descendants.map(fid => c.env.APP_DB.prepare(
        'DELETE FROM folders WHERE id = ? AND user_id = ? AND service_id = ?'
      ).bind(fid, userId, serviceId))
      if (stmts.length > 0) await c.env.APP_DB.batch(stmts)
      items.push({ id, ok: true })
    }
    result = {
      processed: items.filter(i => i.ok).map(i => i.id),
      failed: items.filter(i => !i.ok).map(i => ({
        id: i.id, code: (i.code ?? 'not_found') as 'not_found' | 'conflict', message: i.message ?? '',
      })),
    }
  }

  const response = c.json(result)
  logV2Request(c, start, { route_family: 'v2.folders', operation: `bulk_${body.action}` })
  return response
})

export default foldersV2
