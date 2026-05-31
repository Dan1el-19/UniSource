import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from './middleware/auth';
import { requireAdminMiddleware } from './middleware/admin';
import { adminPreviewMiddleware } from './middleware/adminPreview';
import { loggerMiddleware, logError } from './middleware/logger';
import { V2Error, errorResponse, statusToLegacyLabel, statusToV2Code } from './lib/v2/errors';
import { v2RequestIdGuard } from './middleware/v2RequestIdGuard';
import { foreignKeysMiddleware } from './middleware/foreignKeys';
import { rateLimit } from './middleware/ratelimit';
import upload from './routes/upload';
import files from './routes/files';
import folders from './routes/folders';
import myFiles from './routes/fileRecords';
import userFiles from './routes/userFiles';
import admin from './routes/admin';
import shareLinkRouter from './routes/shareLinks';
import sharesRouter from './routes/shares';
import publicRouter from './routes/public';
import mainStorage from './routes/mainStorage';
import releasesRouter from './routes/releases';
import appRouter from './routes/app';
import superadminRouter from './routes/superadmin';
import v2Router, { publicV2, superadminV2 } from './routes/v2/index';
import { parseAllowedOrigins } from './config/runtime';

const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

app.use('*', async (c, next) => {
  const allowed = parseAllowedOrigins(c.env);
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ['Authorization', 'Content-Type', 'X-Service-ID', 'X-Appwrite-JWT', 'X-Target-User-ID', 'X-Unisource-API-Version'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 600
  });
  return corsMiddleware(c, next);
});
app.use('*', loggerMiddleware);
// B6: enforce SQLite foreign keys for ON DELETE SET NULL etc.
app.use('*', foreignKeysMiddleware);

// Health check — no auth required
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) }));

// ─── Legacy routes ────────────────────────────────────────────────────────────

// Upload gateway — Dual-Auth (JWT or API key)
app.use('/upload/*', authMiddleware);
app.use('/upload/*', rateLimit('general'));
app.route('/upload', upload);

// Admin files list (upload records) — Dual-Auth (API key server-to-server or JWT)
app.use('/admin/files/*', authMiddleware);
app.use('/admin/files/*', rateLimit('general'));
app.use('/admin/files/*', requireAdminMiddleware);
app.route('/admin/files', files);

// Per-user folders CRUD — requires Appwrite JWT (userId extracted)
app.use('/folders/*', authMiddleware);
app.use('/folders/*', rateLimit('general'));
app.use('/folders/*', adminPreviewMiddleware);
app.route('/folders', folders);

// Per-user file records (with trash/move) — requires Appwrite JWT
app.use('/my-files/*', authMiddleware);
app.use('/my-files/*', rateLimit('general'));
app.use('/my-files/*', adminPreviewMiddleware);
app.route('/my-files', myFiles);

// Per-user file records via /files/:id (Plan 2 contract) — requires Appwrite JWT
app.use('/files/*', authMiddleware);
app.use('/files/*', rateLimit('general'));
app.use('/files/*', adminPreviewMiddleware);
app.route('/files', userFiles);

// Admin service info and audit log — Dual-Auth (API key server-to-server or JWT)
app.use('/admin/*', authMiddleware);
app.use('/admin/*', rateLimit('general'));
app.use('/admin/*', requireAdminMiddleware);
app.route('/admin', admin);

// Share link CRUD — JWT only (user must own the file)
app.use('/my-files/:fileId/share-links', authMiddleware);
app.use('/my-files/:fileId/share-links', rateLimit('general'));
app.use('/my-files/:fileId/share-links/*', authMiddleware);
app.use('/my-files/:fileId/share-links/*', rateLimit('general'));
app.use('/share-links/*', authMiddleware);
app.use('/share-links/*', rateLimit('general'));
app.route('/', shareLinkRouter);

// Shares (Plan 2 contract — /shares) — JWT only
app.use('/shares', authMiddleware);
app.use('/shares', rateLimit('general'));
app.use('/shares/*', authMiddleware);
app.use('/shares/*', rateLimit('general'));
app.use('/shares', adminPreviewMiddleware);
app.use('/shares/*', adminPreviewMiddleware);
app.route('/shares', sharesRouter);

// MAIN_STORAGE management — admin-only, dual-auth (API key or admin JWT)
app.use('/main/*', authMiddleware);
app.use('/main/*', rateLimit('general'));
app.use('/main/*', requireAdminMiddleware);
app.route('/main', mainStorage);

// Release management — admin-only per service
app.use('/releases/*', authMiddleware);
app.use('/releases/*', rateLimit('general'));
app.use('/releases/*', requireAdminMiddleware);
app.route('/releases', releasesRouter);

// App-facing endpoints — API key (no admin required)
app.use('/app/*', authMiddleware);
app.use('/app/*', rateLimit('general'));
app.route('/app', appRouter);

// Public share access — no auth required
app.route('/public', publicRouter);

// Superadmin panel API — protected by Cloudflare Access JWT (cfAccessMiddleware applied inside)
app.route('/superadmin', superadminRouter);

// ─── V2 API ───────────────────────────────────────────────────────────────────

// V2 request ID guard — only for V2 paths
app.use('/v2/*', v2RequestIdGuard);

// Public share access under V2 — no auth (must be before general /v2/* auth middleware)
app.route('/v2/public', publicV2);

// Superadmin under V2 — CF Access only (handled inside superadmin router)
app.route('/v2/superadmin', superadminV2);

// All other V2 routes require auth
app.use('/v2/*', authMiddleware);
app.use('/v2/*', rateLimit('general'));
app.use('/v2/*', adminPreviewMiddleware);

// V2 admin-protected routes
app.use('/v2/admin/*', requireAdminMiddleware);
app.use('/v2/main/*', requireAdminMiddleware);
app.use('/v2/releases/*', requireAdminMiddleware);

// V2 error wrapper — transforms legacy error responses to V2 envelopes for /v2/* paths
app.use('/v2/*', async (c, next) => {
  await next();

  const rawRes = c.res;
  if (!rawRes || rawRes.ok) return;

  const contentType = rawRes.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return;

  const body = await rawRes.clone().json().catch(() => null) as { error?: unknown; message?: string } | null;

  // Heuristic: if body.error is already an object (V2 envelope with code/message/request_id),
  // skip the transformation. Legacy errors have body.error as a string.
  if (body && typeof body === 'object' && body.error && typeof body.error === 'object') {
    return;
  }

  const code = statusToV2Code(rawRes.status);
  const message: string | undefined =
    body?.message ?? (typeof body?.error === 'string' ? body.error : undefined);

  c.res = errorResponse(c, new V2Error(code, rawRes.status, message));
});

app.route('/v2', v2Router);

// ─── Error handler ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  const isV2Path = c.req.path.startsWith('/v2/');

  if (err instanceof V2Error) {
    if (isV2Path) return errorResponse(c, err);
    return c.json({ error: statusToLegacyLabel(err.status), message: err.message }, err.status as never);
  }

  if (err instanceof HTTPException) {
    if (isV2Path) {
      const code = statusToV2Code(err.status);
      return errorResponse(c, new V2Error(code, err.status, err.message));
    }
    return err.getResponse();
  }

  logError('Unhandled Application Error', err, c as any);
  if (isV2Path) return errorResponse(c, new V2Error('internal_error', 500, 'Internal server error'));
  return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});

export default {
  fetch: app.fetch,
};
