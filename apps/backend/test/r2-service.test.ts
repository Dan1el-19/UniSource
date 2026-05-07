import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a mock object that we can control
const mockS3Client = {
  send: vi.fn(),
};

// Mock the AWS SDK module
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: vi.fn(function (this: any) {
      Object.assign(this, mockS3Client);
    }),
  };
});

import { headObject } from '../src/services/r2';

const mockEnv = {
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
} as unknown as CloudflareBindings;

describe('headObject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns object size when object exists', async () => {
    mockS3Client.send.mockResolvedValueOnce({ ContentLength: 4096 });
    const result = await headObject(mockEnv, 'my-bucket', 'path/to/file.pdf');
    expect(result).toEqual({ size: 4096 });
  });

  it('returns null when object not found (NoSuchKey)', async () => {
    const err = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    mockS3Client.send.mockRejectedValueOnce(err);
    const result = await headObject(mockEnv, 'my-bucket', 'missing.pdf');
    expect(result).toBeNull();
  });

  it('returns null when object not found (NotFound)', async () => {
    const err = Object.assign(new Error('NotFound'), { name: 'NotFound' });
    mockS3Client.send.mockRejectedValueOnce(err);
    const result = await headObject(mockEnv, 'my-bucket', 'missing.pdf');
    expect(result).toBeNull();
  });

  it('returns null when HTTP 404 returned via $metadata', async () => {
    const err = Object.assign(new Error('Unknown'), { $metadata: { httpStatusCode: 404 } });
    mockS3Client.send.mockRejectedValueOnce(err);
    const result = await headObject(mockEnv, 'my-bucket', 'missing.pdf');
    expect(result).toBeNull();
  });

  it('re-throws non-404 errors', async () => {
    const err = Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' });
    mockS3Client.send.mockRejectedValueOnce(err);
    await expect(headObject(mockEnv, 'my-bucket', 'secret.pdf')).rejects.toThrow('AccessDenied');
  });
});
