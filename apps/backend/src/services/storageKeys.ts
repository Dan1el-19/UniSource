/**
 * Build an R2 object key with the same `<prefix>/uploads/<datePath>/<id>` shape
 * as legacy uploads. Empty prefix produces `uploads/<datePath>/<id>` (no leading slash).
 */
export function buildStorageKey(prefix: string, datePath: string, uploadId: string, ext: string): string {
	const path = `uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
	return prefix ? `${prefix}/${path}` : path;
}

/**
 * Build an Appwrite storage key with the same `<prefix>/uploads/<datePath>/<id>` shape
 * as R2 — the file id should be a full UUID for collision resistance.
 */
export function buildAppwriteStorageKey(prefix: string, datePath: string, fileId: string): string {
	const path = `uploads/${datePath}/${fileId}`;
	return prefix ? `${prefix}/${path}` : path;
}

/**
 * Build a release-storage key under `releases/<prefix>/<safeFilename>`.
 * Filename is sanitized for safe S3 key usage.
 */
export function buildReleaseStorageKey(prefix: string, filename: string): string {
	const safeName = sanitizeFilenameForStorage(filename);
	return `releases/${prefix ? `${prefix}/` : ''}${safeName}`;
}

/**
 * Return the prefix used to scope release listings/sync to a specific service.
 */
export function getReleaseStoragePrefix(prefix: string): string {
	return `releases/${prefix ? `${prefix}/` : ''}`;
}

/**
 * Sanitize an upload filename for safe use as an R2 object key segment.
 * - Strips any path separators and parent-traversal sequences (`..`, `/`, `\`)
 * - Removes leading dots/whitespace
 * - Replaces unsafe characters with `_`
 * - Truncates the resulting basename to 200 chars
 */
function sanitizeFilenameForStorage(filename: string): string {
  // Take last path component to reject traversal attempts.
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  // Drop control chars, NUL, and characters that are unsafe in S3 keys.
  // Keep ASCII letters/digits, dot, hyphen, underscore, space.
  const cleaned = lastSegment
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u001F\u007F]/g, '')
    .replace(/[^A-Za-z0-9._\- ]/g, '_')
    .replace(/^[.\s]+/, '')
    .replace(/\.+$/, (match) => (match.length > 1 ? '.' : match))
    .trim();

  const safe = cleaned.length > 0 ? cleaned : 'release';
  return safe.slice(0, 200);
}
