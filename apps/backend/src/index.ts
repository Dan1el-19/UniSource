import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import { requireAdminMiddleware } from './middleware/admin';
import { adminPreviewMiddleware } from './middleware/adminPreview';
import { loggerMiddleware, logError } from './middleware/logger';
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

/**
 * Default CORS allowlist used when ALLOWED_ORIGINS env var is empty.
 * Keeps the production deployment usable for first-party frontends without
 * configuration, while denying arbitrary origins.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://app.example.com',
  'https://service-b.pages.dev',
  'https://example.com',
  'https://www.example.com',
  'http://localhost:5173',
  'http://localhost:4321',
  'http://localhost:8788'
];

function parseAllowedOrigins(env: CloudflareBindings): string[] {
  const raw = (env as unknown as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

app.use('*', async (c, next) => {
  const allowed = parseAllowedOrigins(c.env);
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return null;
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ['Authorization', 'Content-Type', 'X-Service-ID', 'X-Appwrite-JWT', 'X-Target-User-ID'],
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

app.onError((err, c) => {
  logError('Unhandled Application Error', err, c as any);
  return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});

export default {
  fetch: app.fetch,
};
