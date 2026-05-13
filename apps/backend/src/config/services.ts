export interface ServiceConfig {
  id: string;
  bucketName: string;
  bucketEnvKey: string;
  objectKeyPrefix: string;
  apiKeyEnvVar: string;
  maxFileSizeBytes: number;
}

export const SERVICES: Record<string, ServiceConfig> = {
  usrc: {
    id: 'usrc',
    bucketName: 'unisource',
    bucketEnvKey: 'USRC_BUCKET',
    objectKeyPrefix: 'usrc',
    apiKeyEnvVar: 'USRC_API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
  'chmura-blokserwis': {
    id: 'chmura-blokserwis',
    bucketName: 'chmura-blokserwis',
    bucketEnvKey: 'CHMURA_BLOKSERWIS_BUCKET',
    objectKeyPrefix: '',
    apiKeyEnvVar: 'CHMURA_BLOKSERWIS_API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
};

export const DEFAULT_SERVICE_ID = 'usrc';

export function getServiceConfig(serviceId: string): ServiceConfig | null {
  return SERVICES[serviceId] ?? null;
}

export function isKnownServiceId(serviceId: string): boolean {
  return serviceId in SERVICES;
}

export function buildStorageKey(serviceId: string, datePath: string, uploadId: string, ext: string): string {
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  const path = `uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
  return prefix ? `${prefix}/${path}` : path;
}

/**
 * Build an Appwrite storage key with the same `<prefix>/uploads/<datePath>/<id>` shape
 * as R2 — the file id should be a full UUID for collision resistance.
 */
export function buildAppwriteStorageKey(serviceId: string, datePath: string, fileId: string): string {
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  const path = `uploads/${datePath}/${fileId}`;
  return prefix ? `${prefix}/${path}` : path;
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

export function buildReleaseStorageKey(serviceId: string, filename: string): string {
  const safeName = sanitizeFilenameForStorage(filename);
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  return `releases/${prefix ? `${prefix}/` : ''}${safeName}`;
}

export function getReleaseStoragePrefix(serviceId: string): string {
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  return `releases/${prefix ? `${prefix}/` : ''}`;
}
