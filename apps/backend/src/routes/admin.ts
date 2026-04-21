import { Hono } from 'hono';

type HonoEnv = { Bindings: CloudflareBindings; Variables: WorkerVariables };

const admin = new Hono<HonoEnv>();

export default admin;
