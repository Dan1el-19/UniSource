import { describe, expect, it } from 'vitest';

import { buildStorageKey, getServiceConfig } from '../src/config/services';

describe('service storage configuration', () => {
  it('uses the chmura-blokserwis R2 bucket for the chmura-blokserwis service', () => {
    expect(getServiceConfig('chmura-blokserwis')).toMatchObject({
      bucketName: 'chmura-blokserwis',
      bucketEnvKey: 'CHMURA_BLOKSERWIS_BUCKET',
      objectKeyPrefix: '',
    });
  });

  it('does not prefix object keys with the service id for a dedicated service bucket', () => {
    expect(buildStorageKey('chmura-blokserwis', '2026/05/11', 'upload-123', 'jpg')).toBe(
      'uploads/2026/05/11/upload-123.jpg'
    );
  });

  it('keeps the usrc prefix for the shared UniSource bucket', () => {
    expect(buildStorageKey('usrc', '2026/05/11', 'upload-123', 'pdf')).toBe(
      'usrc/uploads/2026/05/11/upload-123.pdf'
    );
  });
});
