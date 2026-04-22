import type { D1Database } from '@cloudflare/workers-types';
import { deleteObject } from '../services/r2';
import { deleteAppwriteFile, extractAppwriteFileIdFromStorageKey } from '../services/appwrite';
import { releaseQuota } from '../db/services';

const ORPHANED_AGE_SECONDS = 3600; // 1 hour

export async function cleanupOrphanedUploads(
  db: D1Database,
  env: CloudflareBindings,
  logger?: { info: (msg: string, data?: any) => void; error: (msg: string, err: any) => void }
): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - ORPHANED_AGE_SECONDS;

  // Find orphaned uploads
  const orphaned = await db
    .prepare("SELECT * FROM uploads WHERE status = 'pending' AND created_at < ?")
    .bind(cutoff)
    .all<any>();

  const rows = orphaned.results ?? [];
  if (rows.length === 0) {
    if (logger) logger.info('No orphaned uploads found.');
    return;
  }

  if (logger) logger.info(`Found ${rows.length} orphaned uploads to clean up.`);

  let successCount = 0;
  let errorCount = 0;

  for (const upload of rows) {
    try {
      // 1. Delete physical object if it exists (catch 404s gracefully)
      if (upload.destination === 'r2') {
        await deleteObject(env, upload.bucket, upload.storage_key).catch(() => {});
      } else if (upload.destination === 'appwrite') {
        const fileId = extractAppwriteFileIdFromStorageKey(upload.storage_key);
        if (fileId) {
          await deleteAppwriteFile(env, upload.bucket, fileId).catch(() => {});
        }
      }

      // 2. Release the quota reserved during /init
      // Note: we wrapped this into D1 Batch or consecutive calls
      await releaseQuota(db, upload.service_id, upload.size, upload.user_id);

      // 3. Mark as failed or delete from D1
      // We can just delete it to keep uploads table clean, or status='failed'.
      // Let's mark as failed so we have a record.
      await db
        .prepare("UPDATE uploads SET status = 'failed', updated_at = ? WHERE id = ?")
        .bind(Math.floor(Date.now() / 1000), upload.id)
        .run();

      successCount++;
    } catch (err) {
      errorCount++;
      if (logger) logger.error(`Failed to cleanup orphaned upload ${upload.id}`, err);
    }
  }

  if (logger) logger.info('Orphaned cleanup complete', { successCount, errorCount });
}
