import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createShareLink,
  listShareLinksForFile,
  updateShareLink,
  deleteShareLink,
  type ShareLink,
} from '../../db/v1/shareLinks';
import { getFileRecordForUser } from '../../db/v1/fileRecords';
import { hashPassword } from '../../utils/password';
import { generateSlug, isValidSlug } from '../../utils/slug';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';
import { itemOrLegacy, actionOrLegacy, unpaginatedListOrLegacy } from '../../lib/v2/responses';

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
  slug: z.string().trim().min(3).max(64).optional(),
  name: z.string().trim().max(128).optional(),
  password: z.string().min(1).optional(),
  expires_at: z.number().int().positive().optional(),
  max_downloads: z.number().int().positive().optional(),
});

const updateBodySchema = z.object({
  name: z.string().trim().max(128).nullable().optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(1).nullable().optional(),
  expires_at: z.number().int().positive().nullable().optional(),
  max_downloads: z.number().int().positive().nullable().optional(),
});

const fileIdParam = z.object({ fileId: z.string().trim().min(1) });
const linkIdParam = z.object({ linkId: z.string().trim().min(1) });

const shareLinkRouter = new Hono<HonoEnv>();

// POST /my-files/:fileId/share-links
shareLinkRouter.post(
  '/my-files/:fileId/share-links',
  zValidator('param', fileIdParam, v2ValidationHook),
  zValidator('json', createBodySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');
    const body = c.req.valid('json');

    const file = await getFileRecordForUser(c.env.APP_DB, fileId, userId, serviceId);
    if (!file) throw new V2Error('not_found', 404, 'File not found');
    if (file.is_trashed) throw new V2Error('conflict', 409, 'Cannot share a trashed file');

    let slug = body.slug;
    if (slug) {
      if (!isValidSlug(slug)) {
        throw new V2Error('validation_error', 400, 'slug must be 3-64 alphanumeric/dash/underscore chars');
      }
      const existing = await c.env.APP_DB
        .prepare('SELECT id FROM share_links WHERE slug = ?')
        .bind(slug)
        .first();
      if (existing) {
        throw new V2Error('conflict', 409, 'Slug already in use');
      }
    } else {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSlug();
        const existing = await c.env.APP_DB
          .prepare('SELECT id FROM share_links WHERE slug = ?')
          .bind(candidate)
          .first();
        if (!existing) { slug = candidate; break; }
      }
      if (!slug) throw new V2Error('internal_error', 500, 'Could not generate unique slug');
    }

    const password_hash = body.password ? await hashPassword(body.password) : null;
    const id = crypto.randomUUID();

    const link = await createShareLink(c.env.APP_DB, {
      id,
      service_id: serviceId,
      file_id: fileId,
      user_id: userId,
      slug,
      name: body.name ?? null,
      password_hash,
      expires_at: body.expires_at ?? null,
      max_downloads: body.max_downloads ?? null,
    });

    const mapped = mapShareLink(link);
    const response = c.json(itemOrLegacy(c, mapped, { link: mapped }), 201);
    logV2Request(c, start, { route_family: 'shareLinks', operation: 'create' });
    return response;
  }
);

// GET /my-files/:fileId/share-links
shareLinkRouter.get(
  '/my-files/:fileId/share-links',
  zValidator('param', fileIdParam, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');

    const file = await getFileRecordForUser(c.env.APP_DB, fileId, userId, serviceId);
    if (!file) throw new V2Error('not_found', 404, 'File not found');

    const items = (await listShareLinksForFile(c.env.APP_DB, fileId, userId, serviceId)).map(mapShareLink);
    const response = c.json(unpaginatedListOrLegacy(c, items, { items }));
    logV2Request(c, start, { route_family: 'shareLinks', operation: 'list' });
    return response;
  }
);

// PATCH /share-links/:linkId
shareLinkRouter.patch(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, v2ValidationHook),
  zValidator('json', updateBodySchema, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');
    const body = c.req.valid('json');

    const updates: import('../../db/v1/shareLinks').UpdateShareLinkInput = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;
    if (body.expires_at !== undefined) updates.expires_at = body.expires_at;
    if (body.max_downloads !== undefined) updates.max_downloads = body.max_downloads;
    if (body.password !== undefined) {
      updates.password_hash = body.password !== null ? await hashPassword(body.password) : null;
    }

    const link = await updateShareLink(c.env.APP_DB, linkId, userId, serviceId, updates);
    if (!link) throw new V2Error('not_found', 404, 'Share link not found');

    const mapped = mapShareLink(link);
    const response = c.json(itemOrLegacy(c, mapped, { link: mapped }));
    logV2Request(c, start, { route_family: 'shareLinks', operation: 'update' });
    return response;
  }
);

// DELETE /share-links/:linkId
shareLinkRouter.delete(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, v2ValidationHook),
  async (c) => {
    const start = Date.now();
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');

    const deleted = await deleteShareLink(c.env.APP_DB, linkId, userId, serviceId);
    if (!deleted) throw new V2Error('not_found', 404, 'Share link not found');

    const response = c.json(actionOrLegacy(c,
      { id: linkId, deleted: true },
      { success: true as const, id: linkId }
    ));
    logV2Request(c, start, { route_family: 'shareLinks', operation: 'delete' });
    return response;
  }
);

export default shareLinkRouter;
