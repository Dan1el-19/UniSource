import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { FILES_MAX_LIMIT } from '@unisource/sdk'
import { listFilesV2 } from '../../db/v2/files'
import { V2Error } from '../../lib/v2/errors'
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

const filesV2 = new Hono<V2Env>()

filesV2.get('/', zValidator('query', querySchema, v2ValidationHook), async (c) => {
  const start = Date.now()
  const query = c.req.valid('query')
  const userId = c.get('userId')
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

export default filesV2
