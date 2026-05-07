import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import { requireAdminMiddleware } from './middleware/admin';
import { adminPreviewMiddleware } from './middleware/adminPreview';
import { loggerMiddleware, logError } from './middleware/logger';
import { cleanupOrphanedUploads } from './worker/cron';
import upload from './routes/upload';
import files from './routes/files';
import folders from './routes/folders';
import myFiles from './routes/fileRecords';
import admin from './routes/admin';
import shareLinkRouter from './routes/shareLinks';
import publicRouter from './routes/public';
import mainStorage from './routes/mainStorage';


const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

app.use('*', cors());
app.use('*', loggerMiddleware);

// Health check — no auth required
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) }));

// Upload gateway — Dual-Auth (JWT or API key)
app.use('/upload/*', authMiddleware);
app.route('/upload', upload);

// Admin files list — Dual-Auth (API key server-to-server or JWT)
app.use('/files/*', authMiddleware);
app.use('/files/*', requireAdminMiddleware);
app.route('/files', files);

// Per-user folders CRUD — requires Appwrite JWT (userId extracted)
app.use('/folders/*', authMiddleware);
app.use('/folders/*', adminPreviewMiddleware);
app.route('/folders', folders);

// Per-user file records (with trash/move) — requires Appwrite JWT
app.use('/my-files/*', authMiddleware);
app.use('/my-files/*', adminPreviewMiddleware);
app.route('/my-files', myFiles);

// Admin service info and audit log — Dual-Auth (API key server-to-server or JWT)
app.use('/admin/*', authMiddleware);
app.use('/admin/*', requireAdminMiddleware);
app.route('/admin', admin);

// Share link CRUD — JWT only (user must own the file)
app.use('/my-files/:fileId/share-links', authMiddleware);
app.use('/my-files/:fileId/share-links/*', authMiddleware);
app.use('/share-links/*', authMiddleware);
app.route('/', shareLinkRouter);

// MAIN_STORAGE management — requires plus or admin role
app.use('/main/*', authMiddleware);
app.route('/main', mainStorage);

// Public share access — no auth required
app.route('/public', publicRouter);

app.onError((err, c) => {
  logError('Unhandled Application Error', err, c as any);
  return c.json({ error: 'Internal Server Error', message: 'An unexpected error occurred' }, 500);
});

export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: CloudflareBindings, ctx: ExecutionContext) => {
    // Scheduled Cron job for orphaned uploads cleanup
    const mockLogger = {
      info: (msg: string, data?: any) => console.info(JSON.stringify({ level: 'info', message: msg, ...data })),
      error: (msg: string, err: any) => console.error(JSON.stringify({ level: 'error', message: msg, error: String(err) }))
    };
    ctx.waitUntil(cleanupOrphanedUploads(env.APP_DB, env, mockLogger));
  },
};
