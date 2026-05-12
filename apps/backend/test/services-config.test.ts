import { describe, expect, it } from 'vitest';

import { buildStorageKey, getServiceConfig } from '../src/config/services';

describe('service storage configuration', () => {
  it('uses the service-b R2 bucket for the service-b service', () => {
    expect(getServiceConfig('service-b')).toMatchObject({
      bucketName: 'service-b',
      bucketEnvKey: 'SECONDARY_BUCKET',
      objectKeyPrefix: '',
    });
  });

  it('does not prefix object keys with the service id for a dedicated service bucket', () => {
    expect(buildStorageKey('service-b', '2026/05/11', 'upload-123', 'jpg')).toBe(
      'uploads/2026/05/11/upload-123.jpg'
    );
  });

  it('keeps the default prefix for the shared UniSource bucket', () => {
    expect(buildStorageKey('default', '2026/05/11', 'upload-123', 'pdf')).toBe(
      'default/uploads/2026/05/11/upload-123.pdf'
    );
  });
});
