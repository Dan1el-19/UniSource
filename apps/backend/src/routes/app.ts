import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getLatestReleaseByTag } from '../db/releases';
import { generatePresignedGetUrl } from '../services/r2';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60; // 15 minutes

const latestQuerySchema = z.object({
  channel: z.string().trim().min(1).max(64).default('stable'),
});

const app = new Hono<HonoEnv>();

app.get('/releases/latest', zValidator('query', latestQuerySchema), async (c) => {
  const { channel } = c.req.valid('query');

  const serviceId = c.get('serviceId');
  const release = await getLatestReleaseByTag(c.env.APP_DB, serviceId, channel);
  if (!release) {
    return c.json(
      { error: 'Not Found', message: `No completed release found for channel "${channel}"` },
      404
    );
  }

  const service = c.get('service')!;
  const { presigned_url, expires_at } = await generatePresignedGetUrl(
    c.env,
    service.default_bucket,
    release.r2_key,
    DOWNLOAD_URL_TTL_SECONDS,
    release.name
  );

  return c.json({
    id: release.id,
    name: release.name,
    size: release.size,
    r2_key: release.r2_key,
    tags: release.tags,
    notes: release.notes,
    force_update: release.force_update,
    created_at: release.created_at,
    download_url: presigned_url,
    download_url_expires_at: expires_at,
  });
});

export default app;
