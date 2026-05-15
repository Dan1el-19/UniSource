import { describe, it, expect } from 'vitest';
import {
  createR2SigningClient,
  r2ObjectUrl,
  presign,
} from '../src/services/r2/sigv4';

const env = {
  R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'testsecret/testsecret/testsecret/testsecre',
} as unknown as CloudflareBindings;

describe('r2ObjectUrl', () => {
  it('builds path-style URL for bucket+key', () => {
    expect(r2ObjectUrl(env, 'unisource', 'releases/v1.0.0.zip')).toBe(
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/unisource/releases/v1.0.0.zip'
    );
  });

  it('encodes special characters in key segments but preserves /', () => {
    expect(r2ObjectUrl(env, 'unisource', 'my folder/file (1).pdf')).toBe(
      'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com/unisource/my%20folder/file%20(1).pdf'
    );
  });
});

describe('presign GET', () => {
  it('produces SigV4 query-style URL with X-Amz-* params', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'file.bin');
    const signed = await presign(client, base, 'GET', 900);
    const u = new URL(signed);
    expect(u.host).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.r2.cloudflarestorage.com');
    expect(u.pathname).toBe('/unisource/file.bin');
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get('X-Amz-Credential')).toContain('AKIATESTKEY');
  });
});

describe('presign PUT (single-shot upload)', () => {
  it('produces signed URL with custom expiresIn', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'upload.bin');
    const signed = await presign(client, base, 'PUT', 3600);
    const u = new URL(signed);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});

describe('presign PUT for UploadPart', () => {
  it('preserves uploadId+partNumber and adds SigV4 query params', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'big.bin');
    const url = `${base}?uploadId=ABC123&partNumber=7`;
    const signed = await presign(client, url, 'PUT', 900);
    const u = new URL(signed);
    expect(u.searchParams.get('uploadId')).toBe('ABC123');
    expect(u.searchParams.get('partNumber')).toBe('7');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signs only host (does NOT sign Content-Type)', async () => {
    const client = createR2SigningClient(env);
    const base = r2ObjectUrl(env, 'unisource', 'big.bin');
    const signed = await presign(client, `${base}?uploadId=X&partNumber=1`, 'PUT', 900);
    const u = new URL(signed);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).not.toContain('content-type');
  });
});
