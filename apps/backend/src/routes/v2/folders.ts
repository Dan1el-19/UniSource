import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { LIST_MAX_LIMIT } from '@unisource/sdk'
import { listFoldersV2 } from '../../db/v2/folders'
import type { FolderRowV2 } from '../../db/v2/folders'
import { V2Error } from '../../lib/v2/errors'
import { logV2Request } from '../../lib/v2/log'
import { v2ValidationHook } from '../../lib/v2/zodHook'

// ─── Legacy bulk imports — TODO(v2-folders-rest): refactor to v2 standard ────
import {
  getFolderBreadcrumbs,
  bulkTrashFolders,
  bulkRestoreFolders,
  bulkMoveFolders,
  getFolderForUser,
  getDescendantFolderIds,
  type FolderRecord,
} from '../../db/folders'
import {
  bulkFolderIdsSchema,
  bulkFolderMoveRequestSchema,
  type BulkOperationResponse,
  type FolderBreadcrumbsResponse,
  type Folder,
} from '@unisource/sdk'

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

const foldersV2 = new Hono<HonoEnv>()

foldersV2.get('/', zValidator('query', querySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const query = c.req.valid('query')
  const userId = c.get('userId')
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

// ─── Legacy handlers (TODO(v2-folders-rest): refactor to v2 standard) ──────

const folderIdParamSchema = z.object({ id: z.string().trim().min(1) })

function legacyValidationErrorHook(
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

function mapFolderLegacy(folder: FolderRecord): Folder {
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
  }
}

// v2 mapper — FolderRecord (DB row) → FolderRowV2 (public response shape)
// Differs from mapFolderLegacy: color_tag '' is normalised to null (matches db/v2/folders.ts)
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
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { id } = c.req.valid('param')

  const folder = await getFolderForUser(c.env.APP_DB, id, userId, serviceId)
  if (!folder) {
    throw new V2Error('not_found', 404, 'Folder not found')
  }

  const breadcrumbs = await getFolderBreadcrumbs(c.env.APP_DB, id, userId, serviceId)
  return c.json({ breadcrumbs: breadcrumbs.map(mapFolderV2) })
})

foldersV2.post('/bulk-trash', zValidator('json', bulkFolderIdsSchema, v2ValidationHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')
  const successIds = await bulkTrashFolders(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))
  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

// TODO(v2-folders-rest): refactor bulk-* to v2 standard (V2Error, V2Envelope)
foldersV2.post('/bulk-restore', zValidator('json', bulkFolderIdsSchema, legacyValidationErrorHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids } = c.req.valid('json')
  const successIds = await bulkRestoreFolders(c.env.APP_DB, ids, userId, serviceId)
  const failedIds = ids.filter(id => !successIds.includes(id))
  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

// TODO(v2-folders-rest): refactor bulk-* to v2 standard (V2Error, V2Envelope)
foldersV2.post('/bulk-move', zValidator('json', bulkFolderMoveRequestSchema, legacyValidationErrorHook), async (c) => {
  const userId = c.get('userId')
  const serviceId = c.get('serviceId')
  const { ids, parent_id } = c.req.valid('json')

  if (parent_id) {
    const targetFolder = await getFolderForUser(c.env.APP_DB, parent_id, userId, serviceId)
    if (!targetFolder) {
      return c.json({ error: 'Not Found', message: 'Target folder not found' }, 404)
    }
    if (targetFolder.is_trashed) {
      return c.json({ error: 'Conflict', message: 'Cannot move folders into a trashed folder' }, 409)
    }
    if (ids.includes(parent_id)) {
      return c.json({ error: 'Conflict', message: 'Cannot move a folder into itself' }, 409)
    }

    // Cycle prevention: Check if the target parent_id is a descendant of ANY of the folders being moved
    for (const folderId of ids) {
      const descendants = await getDescendantFolderIds(c.env.APP_DB, folderId, userId, serviceId)
      if (descendants.includes(parent_id)) {
        return c.json({ error: 'Conflict', message: 'Cannot move a folder into its own descendant (cycle detected)' }, 409)
      }
    }
  }

  const successIds = await bulkMoveFolders(c.env.APP_DB, ids, userId, serviceId, parent_id ?? null)
  const failedIds = ids.filter(id => !successIds.includes(id))
  return c.json<BulkOperationResponse>({
    success: successIds.length > 0,
    processed_count: successIds.length,
    failed_ids: failedIds.length > 0 ? failedIds : undefined,
  })
})

export default foldersV2
