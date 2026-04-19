import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import upload from './routes/upload';
import files from './routes/files';
import folders from './routes/folders';
import myFiles from './routes/fileRecords';


const app = new Hono<{ Bindings: CloudflareBindings; Variables: WorkerVariables }>();

app.use('*', cors());

// Health check — no auth required
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) }));

// Upload gateway — Dual-Auth (JWT or API key)
app.use('/upload/*', authMiddleware);
app.route('/upload', upload);

// Admin files list — Dual-Auth (API key server-to-server or JWT)
app.use('/files/*', authMiddleware);
app.route('/files', files);

// Per-user folders CRUD — requires Appwrite JWT (userId extracted)
app.use('/folders/*', authMiddleware);
app.route('/folders', folders);

// Per-user file records (with trash/move) — requires Appwrite JWT
app.use('/my-files/*', authMiddleware);
app.route('/my-files', myFiles);

export default app;
