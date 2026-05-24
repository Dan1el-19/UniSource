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
import { createSignedToken, verifySignedToken } from '../utils/signedTokens';
import { rateLimit } from '../middleware/ratelimit';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL = 15 * 60;
const PUBLIC_DOWNLOAD_SCOPE = 'public-download';

const slugParam = z.object({ slug: z.string().trim().min(1) });
const downloadTokenQuery = z.object({ token: z.string().trim().min(1) });

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
  storageDestination: string,
  storageKey: string,
  bucket: string,
  filename: string
): Promise<{ download_url: string; url_expires_at: number }> {
  if (storageDestination === 'r2') {
    const { presigned_url, expires_at } = await generatePresignedGetUrl(
      env,
      bucket,
      storageKey,
      DOWNLOAD_URL_TTL,
      filename
    );
    return { download_url: presigned_url, url_expires_at: expires_at };
  }

  const appwriteFileId = extractAppwriteFileIdFromStorageKey(storageKey);
  if (!appwriteFileId) throw new Error('Invalid Appwrite storage key');

  const token = await createAppwriteFileToken(env, bucket, appwriteFileId, DOWNLOAD_URL_TTL);
  const downloadUrl = buildAppwriteFileDownloadUrl(env, bucket, appwriteFileId, token.secret);
  return { download_url: downloadUrl, url_expires_at: token.expires_at };
}

/**
 * S2: Public download links are signed with a dedicated `DOWNLOAD_TOKEN_SECRET`
 * binding (configured via `wrangler secret put`). Falls back to a derivation of
 * the Appwrite key + project id only when the dedicated secret is missing — this
 * is the legacy behaviour, kept temporarily so existing deployments do not break,
 * but should be retired once `DOWNLOAD_TOKEN_SECRET` is rolled out everywhere.
 */
function getPublicDownloadSecret(env: CloudflareBindings): string {
  const dedicated = (env as unknown as { DOWNLOAD_TOKEN_SECRET?: string }).DOWNLOAD_TOKEN_SECRET;
  if (dedicated && dedicated.length > 0) {
    return `${dedicated}:${PUBLIC_DOWNLOAD_SCOPE}`;
  }
  return `${env.APPWRITE_API_KEY}:${env.APPWRITE_PROJECT_ID}:${PUBLIC_DOWNLOAD_SCOPE}`;
}

async function createPublicDownloadUrl(
  c: { env: CloudflareBindings; req: { url: string } },
  slug: string,
  expiresAt: number
): Promise<string> {
  const token = await createSignedToken(getPublicDownloadSecret(c.env), { slug, exp: expiresAt });
  const downloadUrl = new URL(c.req.url);
  downloadUrl.pathname = `/public/${encodeURIComponent(slug)}/download`;
  downloadUrl.search = '';
  downloadUrl.searchParams.set('token', token);
  return downloadUrl.toString();
}

const publicRouter = new Hono<HonoEnv>();

publicRouter.get('/:slug', rateLimit('public-read'), zValidator('param', slugParam, validationErrorHook), async (c) => {
  const { slug } = c.req.valid('param');
  const now = Math.floor(Date.now() / 1000);

  const link = await getShareLinkBySlug(c.env.APP_DB, slug);
  if (!link || !link.is_active) {
    return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
  }
  if (link.expires_at && link.expires_at < now) {
    return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
  }
  if (link.max_downloads !== null && link.download_count >= link.max_downloads) {
    return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
  }

  const file = await getFileRecord(c.env.APP_DB, link.file_id);
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
    const { url_expires_at } = await generateDownloadUrl(
      c.env,
      file.storage_destination,
      file.storage_key,
      file.bucket,
      file.filename
    );

    c.header('Cache-Control', 'no-store');
    return c.json({
      file_id: file.id,
      filename: file.filename,
      size: file.size,
      mime_type: file.mime_type,
      requires_password: false,
      download_url: await createPublicDownloadUrl(c, slug, url_expires_at),
      url_expires_at,
      link_name: link.name,
      link_expires_at: link.expires_at,
    });
  } catch {
    // S5: do not echo upstream provider details to the public client.
    return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
  }
});

publicRouter.post(
  '/:slug/unlock',
  rateLimit('share-password', { discriminator: (c) => c.req.param('slug') }),
  zValidator('param', slugParam, validationErrorHook),
  zValidator('json', z.object({ password: z.string().min(1) }), validationErrorHook),
  async (c) => {
    const { slug } = c.req.valid('param');
    const { password } = c.req.valid('json');
    const now = Math.floor(Date.now() / 1000);

    const link = await getShareLinkBySlug(c.env.APP_DB, slug);
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

    const file = await getFileRecord(c.env.APP_DB, link.file_id);
    if (!file || file.is_trashed) {
      return c.json({ error: 'Not Found', message: 'File not available' }, 404);
    }

    try {
      const { url_expires_at } = await generateDownloadUrl(
        c.env,
        file.storage_destination,
        file.storage_key,
        file.bucket,
        file.filename
      );

      c.header('Cache-Control', 'no-store');
      return c.json({
        file_id: file.id,
        filename: file.filename,
        size: file.size,
        mime_type: file.mime_type,
        requires_password: false,
        download_url: await createPublicDownloadUrl(c, slug, url_expires_at),
        url_expires_at,
        link_name: link.name,
        link_expires_at: link.expires_at,
      });
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
    }
  }
);

publicRouter.get(
  '/:slug/download',
  rateLimit('public-read'),
  zValidator('param', slugParam, validationErrorHook),
  zValidator('query', downloadTokenQuery, validationErrorHook),
  async (c) => {
    const { slug } = c.req.valid('param');
    const { token } = c.req.valid('query');
    const payload = await verifySignedToken<{ slug: string; exp: number }>(getPublicDownloadSecret(c.env), token);

    if (!payload || payload.slug !== slug) {
      return c.json({ error: 'Unauthorized', message: 'Download session expired or invalid' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const link = await getShareLinkBySlug(c.env.APP_DB, slug);
    if (!link || !link.is_active) {
      return c.json({ error: 'Not Found', message: 'Share link not found or inactive' }, 404);
    }
    if (link.expires_at && link.expires_at < now) {
      return c.json({ error: 'Gone', message: 'Share link has expired' }, 410);
    }

    // B5: atomic increment + max_downloads check. The DB UPDATE only succeeds
    // when the link is still under cap; concurrent requests on the last slot
    // can therefore not both exceed the limit.
    const incremented = await incrementDownloadCount(c.env.APP_DB, link.id);
    if (!incremented) {
      return c.json({ error: 'Gone', message: 'Download limit reached' }, 410);
    }

    const file = await getFileRecord(c.env.APP_DB, link.file_id);
    if (!file || file.is_trashed) {
      return c.json({ error: 'Not Found', message: 'File not available' }, 404);
    }

    try {
      const { download_url } = await generateDownloadUrl(
        c.env,
        file.storage_destination,
        file.storage_key,
        file.bucket,
        file.filename
      );

      // Audit logging is best-effort and does not block the redirect.
      const auditLog = Promise.resolve(
        logServiceEvent(c.env.APP_DB, {
          serviceId: link.service_id,
          userId: link.user_id,
          action: 'share_link_accessed',
          resourceType: 'file',
          resourceId: link.file_id,
          metadata: { slug, link_id: link.id },
          ipAddress: c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for'),
        })
      );
      try {
        c.executionCtx.waitUntil(auditLog);
      } catch {
        auditLog.catch(() => undefined);
      }

      c.header('Cache-Control', 'no-store');
      return new Response(null, {
        status: 302,
        headers: {
          Location: download_url,
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return c.json({ error: 'Bad Gateway', message: 'Unable to generate download URL' }, 502);
    }
  }
);

export default publicRouter;
