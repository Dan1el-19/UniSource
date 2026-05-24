import { createMiddleware } from 'hono/factory';

/**
 * SQLite/D1 does not enforce FK constraints unless `PRAGMA foreign_keys = ON`
 * is run on the connection. D1 worker connections are short-lived, so we set
 * the pragma at the start of each request before any other DB statement.
 *
 * Matters for `ON DELETE SET NULL` (uploads → files), so deleting an upload
 * record nulls out `files.upload_id` instead of leaving dangling references.
 */
export const foreignKeysMiddleware = createMiddleware<{
  Bindings: CloudflareBindings;
  Variables: WorkerVariables;
}>(async (c, next) => {
  // D1 only supports a subset of pragmas; foreign_keys is one of them.
  // Failures here are non-fatal — we continue with FK enforcement off.
  try {
    await c.env.APP_DB.prepare('PRAGMA foreign_keys = ON').run();
  } catch {
    // Best-effort: D1 may have FKs already enabled by default in some envs.
  }
  return next();
});
