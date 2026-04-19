import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth';
import upload from './routes/upload';
import files from './routes/files';


const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use('*', cors());

// Health check — no auth required
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) }));

// Upload gateway — requires Bearer token auth
app.use('/upload/*', authMiddleware);
app.route('/upload', upload);

// Files metadata gateway — requires Bearer token auth
app.use('/files/*', authMiddleware);
app.route('/files', files);

export default app;
