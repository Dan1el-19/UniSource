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
} from '../db/shareLinks';
import { getFileRecordForUser } from '../db/fileRecords';
import { hashPassword } from '../utils/password';
import { generateSlug, isValidSlug } from '../utils/slug';
import type { ShareLinkCreateResponse, ShareLinkListResponse } from '@unisource/sdk';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  const path = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return c.json({ error: 'Bad Request', message: `${path}${issue?.message ?? 'Validation failed'}` }, 400);
}

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
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const links = await listShareLinksForUser(c.env.APP_DB, userId, serviceId);
  return c.json<ShareLinkListResponse>({ items: links.map(mapShareLink) });
});

// POST /shares
sharesRouter.post(
  '/',
  zValidator('json', createBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const body = c.req.valid('json');

    const file = await getFileRecordForUser(c.env.APP_DB, body.file_id, userId, serviceId);
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);
    if (file.is_trashed) return c.json({ error: 'Conflict', message: 'Cannot share a trashed file' }, 409);

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
    if (!slug) return c.json({ error: 'Internal Server Error', message: 'Could not generate unique slug' }, 500);

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

    return c.json<ShareLinkCreateResponse>({ link: mapShareLink(link) }, 201);
  }
);

// GET /shares/:id
sharesRouter.get('/:id', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const link = await getShareLinkById(c.env.APP_DB, id);
  if (!link || link.user_id !== userId || link.service_id !== serviceId) {
    return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);
  }

  return c.json({ link: mapShareLink(link) });
});

// DELETE /shares/:id
sharesRouter.delete('/:id', zValidator('param', idParam, validationErrorHook), async (c) => {
  const userId = c.get('userId');
  const serviceId = c.get('serviceId');
  const { id } = c.req.valid('param');

  const deleted = await deleteShareLink(c.env.APP_DB, id, userId, serviceId);
  if (!deleted) return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);

  return c.json({ success: true as const, id });
});

export default sharesRouter;
