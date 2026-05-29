import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getLatestReleaseByTag } from '../../db/v1/releases';
import { generatePresignedGetUrl } from '../../services/r2';
import { V2Error } from '../../lib/v2/errors';
import { logV2Request } from '../../lib/v2/log';
import { v2ValidationHook } from '../../lib/v2/zodHook';
import { itemOrLegacy } from '../../lib/v2/responses';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60; // 15 minutes

const latestQuerySchema = z.object({
  channel: z.string().trim().min(1).max(64).default('stable'),
});

const app = new Hono<HonoEnv>();

app.get('/releases/latest', zValidator('query', latestQuerySchema, v2ValidationHook), async (c) => {
  const start = Date.now();
  const { channel } = c.req.valid('query');

  const serviceId = c.get('serviceId');
  const release = await getLatestReleaseByTag(c.env.APP_DB, serviceId, channel);
  if (!release) {
    throw new V2Error('not_found', 404, `No completed release found for channel "${channel}"`);
  }

  const service = c.get('service')!;
  const { presigned_url, expires_at } = await generatePresignedGetUrl(
    c.env,
    service.default_bucket,
    release.r2_key,
    DOWNLOAD_URL_TTL_SECONDS,
    release.name
  );

  const releaseData = {
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
  };
  const response = c.json(itemOrLegacy(c, releaseData, releaseData));
  logV2Request(c, start, { route_family: 'app', operation: 'latest_release' });
  return response;
});

export default app;
