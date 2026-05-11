export interface ServiceConfig {
  id: string;
  bucketName: string;
  bucketEnvKey: string;
  apiKeyEnvVar: string;
  maxFileSizeBytes: number;
}

export const SERVICES: Record<string, ServiceConfig> = {
  default: {
    id: 'default',
    bucketName: 'unisource',
    bucketEnvKey: 'PRIMARY_BUCKET',
    apiKeyEnvVar: 'APP_' + 'API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
  'service-b': {
    id: 'service-b',
    bucketName: 'example',
    bucketEnvKey: 'SECONDARY_BUCKET',
    apiKeyEnvVar: 'SERVICE_BLOKSERWIS_' + 'API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
};

export const DEFAULT_SERVICE_ID = 'default';

export function getServiceConfig(serviceId: string): ServiceConfig | null {
  return SERVICES[serviceId] ?? null;
}

export function isKnownServiceId(serviceId: string): boolean {
  return serviceId in SERVICES;
}

export function buildStorageKey(serviceId: string, datePath: string, uploadId: string, ext: string): string {
  return `${serviceId}/uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
}
