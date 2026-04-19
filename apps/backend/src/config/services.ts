// Static service registry — each service maps to its own R2 bucket
// When adding a new service, also add the R2 binding to wrangler.jsonc and CloudflareBindings

export interface ServiceConfig {
  id: string;
  bucketName: string;          // R2 bucket name (for S3 presigned URL calls)
  bucketEnvKey: string;        // CloudflareBindings key for direct R2 binding
  apiKeyEnvVar: string;        // CloudflareBindings secret key for server-to-server auth
  maxFileSizeBytes: number;
}

export const SERVICES: Record<string, ServiceConfig> = {
  default: {
    id: 'default',
    bucketName: 'unisource',
    bucketEnvKey: 'PRIMARY_BUCKET',
    apiKeyEnvVar: 'SERVICE_API_KEY',
    maxFileSizeBytes: 536_870_912, // 500 MB
  },
  example: {
    id: 'example',
    bucketName: 'example',
    bucketEnvKey: 'BLOKSERWIS_BUCKET',
    apiKeyEnvVar: 'BLOKSERWIS_API_KEY',
    maxFileSizeBytes: 2_147_483_648, // 2 GB
  },
};

export const DEFAULT_SERVICE_ID = 'default';

export function getServiceConfig(serviceId: string): ServiceConfig | null {
  return SERVICES[serviceId] ?? null;
}

export function isKnownServiceId(serviceId: string): boolean {
  return serviceId in SERVICES;
}

// Build storage key with service prefix for proper bucket isolation
export function buildStorageKey(serviceId: string, datePath: string, uploadId: string, ext: string): string {
  return `${serviceId}/uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
}
