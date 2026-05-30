import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createShareLink,
  listShareLinksForFile,
  updateShareLink,
  deleteShareLink,
  type ShareLink,
} from '../db/shareLinks';
import { getFileRecordForUser } from '../db/fileRecords';
import { hashPassword } from '../utils/password';
import { generateSlug, isValidSlug } from '../utils/slug';
import type {
  ShareLinkCreateResponse,
  ShareLinkListResponse,
  ShareLinkUpdateResponse,
} from '@unisource/sdk';

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
  zValidator('param', fileIdParam, validationErrorHook),
  zValidator('json', createBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');
    const body = c.req.valid('json');

    const file = await getFileRecordForUser(c.env.APP_DB, fileId, userId, serviceId);
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);
    if (file.is_trashed) return c.json({ error: 'Conflict', message: 'Cannot share a trashed file' }, 409);

    let slug = body.slug;
    if (slug) {
      if (!isValidSlug(slug)) {
        return c.json({ error: 'Bad Request', message: 'slug must be 3–64 alphanumeric/dash/underscore chars' }, 400);
      }
      const existing = await c.env.APP_DB
        .prepare('SELECT id FROM share_links WHERE slug = ?')
        .bind(slug)
        .first();
      if (existing) {
        return c.json({ error: 'Conflict', message: 'Slug already in use' }, 409);
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
      if (!slug) return c.json({ error: 'Internal Server Error', message: 'Could not generate unique slug' }, 500);
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

    return c.json<ShareLinkCreateResponse>({ link: mapShareLink(link) }, 201);
  }
);

// GET /my-files/:fileId/share-links
shareLinkRouter.get(
  '/my-files/:fileId/share-links',
  zValidator('param', fileIdParam, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { fileId } = c.req.valid('param');

    const file = await getFileRecordForUser(c.env.APP_DB, fileId, userId, serviceId);
    if (!file) return c.json({ error: 'Not Found', message: 'File not found' }, 404);

    const links = await listShareLinksForFile(c.env.APP_DB, fileId, userId, serviceId);
    return c.json<ShareLinkListResponse>({ items: links.map(mapShareLink) });
  }
);

// PATCH /share-links/:linkId
shareLinkRouter.patch(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, validationErrorHook),
  zValidator('json', updateBodySchema, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');
    const body = c.req.valid('json');

    const updates: import('../db/shareLinks').UpdateShareLinkInput = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;
    if (body.expires_at !== undefined) updates.expires_at = body.expires_at;
    if (body.max_downloads !== undefined) updates.max_downloads = body.max_downloads;
    if (body.password !== undefined) {
      updates.password_hash = body.password !== null ? await hashPassword(body.password) : null;
    }

    const link = await updateShareLink(c.env.APP_DB, linkId, userId, serviceId, updates);
    if (!link) return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);

    return c.json<ShareLinkUpdateResponse>({ link: mapShareLink(link) });
  }
);

// DELETE /share-links/:linkId
shareLinkRouter.delete(
  '/share-links/:linkId',
  zValidator('param', linkIdParam, validationErrorHook),
  async (c) => {
    const userId = c.get('userId');
    const serviceId = c.get('serviceId');
    const { linkId } = c.req.valid('param');

    const deleted = await deleteShareLink(c.env.APP_DB, linkId, userId, serviceId);
    if (!deleted) return c.json({ error: 'Not Found', message: 'Share link not found' }, 404);

    return c.json({ success: true as const, id: linkId });
  }
);

export default shareLinkRouter;
