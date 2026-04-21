import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getShareLinkBySlug, incrementDownloadCount } from '../db/shareLinks';
import { getFileRecord } from '../db/fileRecords';
import { logServiceEvent } from '../db/services';
import { verifyPassword } from '../utils/password';
import { generatePresignedGetUrl } from '../services/r2';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  extractAppwriteFileIdFromStorageKey,
} from '../services/appwrite';
import { getServiceConfig } from '../config/services';

type HonoEnv = { Bindings: CloudflareBindings };

const DOWNLOAD_URL_TTL = 15 * 60;

const slugParam = z.object({ slug: z.string().trim().min(1) });

function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ path: Array<PropertyKey>; message: string }> } },
  c: { json: (v: unknown, s?: number) => Response }
) {
  if (result.success) return;
  const issue = result.error?.issues[0];
  return c.json({ error: 'Bad Request', message: issue?.message ?? 'Validation failed' }, 400);
}

async function generateDownloadUrl(
  env: CloudflareBindings,
  serviceId: string,
  storageDestination: string,
  storageKey: string,
  bucket: string
): Promise<{ download_url: string; url_expires_at: number }> {
  if (storageDestination === 'r2') {
    const svcConfig = getServiceConfig(serviceId)!;
    const { presigned_url, expires_at } = await generatePresignedGetUrl(
      env,
      svcConfig.bucketName,
      storageKey,
      DOWNLOAD_URL_TTL
    );
    return { download_url: presigned_url, url_expires_at: expires_at };
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(storageKey);
  if (!appwriteFileId) throw new Error('Invalid Appwrite storage key');

  const token = await createAppwriteFileToken(env, bucket, appwriteFileId, DOWNLOAD_URL_TTL);
  const downloadUrl = buildAppwriteFileDownloadUrl(env, bucket, appwriteFileId, token.secret);
  return { download_url: downloadUrl, url_expires_at: token.expires_at };
}

const publicRouter = new Hono<HonoEnv>();

publicRouter.get('/:slug', zValidator('param', slugParam, validationErrorHook), async (c) => {
  const { slug } = c.req.valid('param');
  const now = Math.floor(Date.now() / 1000);

  const link = await getShareLinkBySlug(c.env.usrc_d1, slug);
  if (!link || !link.is_active) {
    return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
  }
  if (link.expires_at && link.expires_at < now) {
    return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
  }
  if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
    return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
  }

  const file = await getFileRecord(c.env.usrc_d1, link.file_id);
  if (!file || file.is_trashed) {
    return c.json({ error: 'Not Found', message: 'File not available' }, 404);
  }

  if (link.password_hash) {
    return c.json({
      filename: file.filename,
      size: file.size,
      mime_type: file.mime_type,
      requires_password: true,
      link_name: link.name,
    });
  }

  try {
    const { download_url, url_expires_at } = await generateDownloadUrl(
      c.env,
      link.service_id,
      file.storage_destination,
      file.storage_key,
      file.bucket
    );

    c.executionCtx.waitUntil(
      Promise.all([
        incrementDownloadCount(c.env.usrc_d1, link.id),
        logServiceEvent(c.env.usrc_d1, {
          serviceId: link.service_id,
          userId: link.user_id,
          action: 'share_link_accessed',
          resourceType: 'file',
          resourceId: link.file_id,
          metadata: { slug, link_id: link.id },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        }),
      ])
    );

    c.header('Cache-Control', 'no-store');
    return c.json({
      file_id: file.id,
      filename: file.filename,
      size: file.size,
      mime_type: file.mime_type,
      requires_password: false,
      download_url,
      url_expires_at,
      link_name: link.name,
      link_expires_at: link.expires_at,
    });
  } catch {
    return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
  }
});

publicRouter.post(
  '/:slug/unlock',
  zValidator('param', slugParam, validationErrorHook),
  zValidator('json', z.object({ password: z.string().min(1) }), validationErrorHook),
  async (c) => {
    const { slug } = c.req.valid('param');
    const { password } = c.req.valid('json');
    const now = Math.floor(Date.now() / 1000);

    const link = await getShareLinkBySlug(c.env.usrc_d1, slug);
    if (!link || !link.is_active) {
      return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
    }
    if (link.expires_at && link.expires_at < now) {
      return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
    }
    if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
      return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
    }
    if (!link.password_hash) {
      return c.json({ error: 'Bad Request', message: 'This link has no password' }, 400);
    }

    const ok = await verifyPassword(password, link.password_hash);
    if (!ok) return c.json({ error: 'Unauthorized', message: 'Incorrect password' }, 401);

    const file = await getFileRecord(c.env.usrc_d1, link.file_id);
    if (!file || file.is_trashed) {
      return c.json({ error: 'Not Found', message: 'File not available' }, 404);
    }

    try {
      const { download_url, url_expires_at } = await generateDownloadUrl(
        c.env,
        link.service_id,
        file.storage_destination,
        file.storage_key,
        file.bucket
      );

      c.executionCtx.waitUntil(
        Promise.all([
          incrementDownloadCount(c.env.usrc_d1, link.id),
          logServiceEvent(c.env.usrc_d1, {
            serviceId: link.service_id,
            userId: link.user_id,
            action: 'share_link_accessed',
            resourceType: 'file',
            resourceId: link.file_id,
            metadata: { slug, link_id: link.id },
            ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
          }),
        ])
      );

      c.header('Cache-Control', 'no-store');
      return c.json({
        file_id: file.id,
        filename: file.filename,
        size: file.size,
        mime_type: file.mime_type,
        requires_password: false,
        download_url,
        url_expires_at,
        link_name: link.name,
        link_expires_at: link.expires_at,
      });
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
    }
  }
);

export default publicRouter;
