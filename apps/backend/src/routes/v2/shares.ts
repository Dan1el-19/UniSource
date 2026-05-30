/**
 * /shares — Plan 2 share link endpoints
 * GET    /shares          — list all user's share links
 * POST   /shares          — create share link (file_id in body)
 * GET    /shares/:id      — get single share link
 * DELETE /shares/:id      — delete share link
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createShareLink,
  deleteShareLink,
  getShareLinkById,
  listShareLinksForUser,
  type ShareLink,
} from '../../db/v1/shareLinks';
import { getFileRecordForUser } from '../../db/v1/fileRecords';
import { hashPassword } from '../../utils/password';
import { generateSlug, isValidSlug } from '../../utils/slug';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

function mapShareLink(link: ShareLink) {
  return {
    id: link.id,
    service_id: link.service_id,
    file_id: link.file_id,
    user_id: link.user_id,
    slug: link.slug,
    name: link.name,
    has_password: link.password_hash !== null,
    expires_at: link.expires_at,
    download_count: link.download_count,
    max_downloads: link.max_downloads,
    is_active: link.is_active === 1,
    created_at: link.created_at,
    updated_at: link.updated_at,
  };
}

const createBodySchema = z.object({
  file_id: z.string().trim().min(1),
  name: z.string().trim().max(128).optional(),
  expires_at: z.number().int().positive().optional(),
  max_downloads: z.number().int().positive().optional(),
  password: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.string().trim().min(1) });

const sharesRouter = new Hono<HonoEnv>();

// GET /shares
sharesRouter.get('/', async (c) => {
  const start = Date.now();
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const items = (await listShareLinksForUser(c.env.APP_DB, userId, serviceId)).map(mapShareLink);
  const response = c.json({ items, page: { limit: items.length, next_cursor: null } });
  logV2Request(c, start, { route_family: 'shares', operation: 'list' });
  return response;
});

// POST /shares
sharesRouter.post(
  '/',
  zValidator('json', createBodySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const body = c.req.valid('json');

    const file = await getFileRecordForUser(c.env.APP_DB, body.file_id, userId, serviceId);
    if (!file) throw new V2Error('not_found', 404, 'File not found');
    if (file.is_trashed) throw new V2Error('conflict', 409, 'Cannot share a trashed file');

    // Generate unique slug
    let slug: string | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateSlug();
      const existing = await c.env.APP_DB
        .prepare('SELECT id FROM share_links WHERE slug = ?')
        .bind(candidate)
        .first();
      if (!existing) { slug = candidate; break; }
    }
    if (!slug) throw new V2Error('internal_error', 500, 'Could not generate unique slug');

    const password_hash = body.password ? await hashPassword(body.password) : null;
    const id = crypto.randomUUID();

    const link = await createShareLink(c.env.APP_DB, {
      id,
      service_id: serviceId,
      file_id: body.file_id,
      user_id: userId,
      slug,
      name: body.name ?? null,
      password_hash,
      expires_at: body.expires_at ?? null,
      max_downloads: body.max_downloads ?? null,
    });

    const mapped = mapShareLink(link);
    const response = c.json({ item: mapped }, 201);
    logV2Request(c, start, { route_family: 'shares', operation: 'create' });
    return response;
  }
);

// GET /shares/:id
sharesRouter.get('/:id', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const start = Date.now();
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const link = await getShareLinkById(c.env.APP_DB, id);
  if (!link || link.user_id !== userId || link.service_id !== serviceId) {
    throw new V2Error('not_found', 404, 'Share link not found');
  }

  const mapped = mapShareLink(link);
  const response = c.json({ item: mapped });
  logV2Request(c, start, { route_family: 'shares', operation: 'get' });
  return response;
});

// DELETE /shares/:id
sharesRouter.delete('/:id', zValidator('param', idParam, v2ValidationHook), async (c) => {
  const start = Date.now();
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const deleted = await deleteShareLink(c.env.APP_DB, id, userId, serviceId);
  if (!deleted) throw new V2Error('not_found', 404, 'Share link not found');

  const response = c.json({ item: { id, deleted: true } });
  logV2Request(c, start, { route_family: 'shares', operation: 'delete' });
  return response;
});

export default sharesRouter;
