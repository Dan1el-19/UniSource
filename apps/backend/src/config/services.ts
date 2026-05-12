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
    apiKeyEnvVar: 'USRC_' + 'API_KEY',
    maxFileSizeBytes: 5_368_709_120,
  },
  'chmura-blokserwis': {
    id: 'chmura-blokserwis',
    bucketName: 'chmura-blokserwis',
    bucketEnvKey: 'CHMURA_BLOKSERWIS_BUCKET',
    objectKeyPrefix: '',
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
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  const path = `uploads/${datePath}/${uploadId}${ext ? '.' + ext : ''}`;
  return prefix ? `${prefix}/${path}` : path;
}

export function buildReleaseStorageKey(serviceId: string, filename: string): string {
  const lastSegment = filename.split(/[\\/]/).pop() ?? filename;
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  return `releases/${prefix ? `${prefix}/` : ''}${lastSegment}`;
}

export function getReleaseStoragePrefix(serviceId: string): string {
  const prefix = getServiceConfig(serviceId)?.objectKeyPrefix;
  return `releases/${prefix ? `${prefix}/` : ''}`;
}
