export interface ServiceConfig {
  id: string;
  bucketName: string;
  bucketEnvKey: string;
  apiKeyEnvVar: string;
  maxFileSizeBytes: number;
}

export const SERVICES: Record<string, ServiceConfig> = {
  usrc: {
    id: 'usrc',
    bucketName: 'unisource',
    bucketEnvKey: 'USRC_BUCKET',
    apiKeyEnvVar: 'USRC_' + 'API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
  'chmura-blokserwis': {
    id: 'chmura-blokserwis',
    bucketName: 'blokserwis',
    bucketEnvKey: 'CHMURA_BLOKSERWIS_BUCKET',
    apiKeyEnvVar: 'CHMURA_BLOKSERWIS_' + 'API_KEY',
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
  return `${serviceId}/uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
}
