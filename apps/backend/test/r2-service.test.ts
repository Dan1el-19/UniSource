import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import {
  headObject,
  deleteObject,
  createMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  signUploadPart,
  listUploadedParts,
  generatePresignedPutUrl,
  generatePresignedGetUrl,
} from '../src/services/r2';

// PRIMARY_BUCKET is provisioned by wrangler.jsonc; vitest-pool-workers exposes it
// as a Miniflare R2 binding. We use the matching SERVICES map id.
const BUCKET = 'unisource';

// CI runners do not have R2 creds in .dev.vars (it's gitignored). aws4fetch's
// AwsClient throws on construction if accessKeyId/secretAccessKey are missing.
// We override with dummy strings — tests only inspect URL shape, not real R2.
const cfEnv = {
  ...env,
  R2_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'testsecret/testsecret/testsecret/testsecret',
} as unknown as CloudflareBindings;

const fixtures = {
  'empty.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
</ListPartsResult>`,
  'single-part.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"d41d8cd98f00b204e9800998ecf8427e"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>`,
  'single-page.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <MaxParts>1000</MaxParts>
  <IsTruncated>false</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>2</PartNumber>
    <LastModified>2026-05-01T12:00:01.000Z</LastModified>
    <ETag>"b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"</ETag>
    <Size>5242880</Size>
  </Part>
  <Part>
    <PartNumber>3</PartNumber>
    <LastModified>2026-05-01T12:00:02.000Z</LastModified>
    <ETag>"c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"</ETag>
    <Size>1048576</Size>
  </Part>
</ListPartsResult>`,
  'truncated.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ListPartsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Bucket>test-bucket</Bucket>
  <Key>test-key</Key>
  <UploadId>U1</UploadId>
  <PartNumberMarker>0</PartNumberMarker>
  <NextPartNumberMarker>1</NextPartNumberMarker>
  <MaxParts>1</MaxParts>
  <IsTruncated>true</IsTruncated>
  <Part>
    <PartNumber>1</PartNumber>
    <LastModified>2026-05-01T12:00:00.000Z</LastModified>
    <ETag>"a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"</ETag>
    <Size>5242880</Size>
  </Part>
</ListPartsResult>`,
  's3-error.xml': `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchUpload</Code>
  <Message>The specified multipart upload does not exist.</Message>
  <UploadId>U1</UploadId>
  <RequestId>req-1</RequestId>
  <HostId>host-1</HostId>
</Error>`,
} as const;

async function clearBucket() {
  const list = await env.PRIMARY_BUCKET.list();
  for (const obj of list.objects) {
    await env.PRIMARY_BUCKET.delete(obj.key);
  }
}

describe('headObject (Miniflare R2 binding)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });
  beforeEach(clearBucket);

  it('returns size for existing object', async () => {
    await env.PRIMARY_BUCKET.put('hello.txt', 'hello world');
    const result = await headObject(cfEnv,BUCKET, 'hello.txt');
    expect(result).toEqual({ size: 11 });
  });

  it('returns null for missing object (NO throw)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch;

    const result = await headObject(cfEnv,BUCKET, 'does-not-exist.bin');
    expect(result).toBeNull();
  });

  it('falls back to S3 HEAD when the local binding does not see a directly uploaded object', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(null, { status: 200, headers: { 'Content-Length': '1234' } })
    ) as unknown as typeof globalThis.fetch;

    const result = await headObject(cfEnv,BUCKET, 'direct-upload.bin');

    expect(result).toEqual({ size: 1234 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/unisource/direct-upload.bin?'),
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('throws for unknown bucket name (falls through to S3 which fails)', async () => {
    // With dynamic binding lookup, unknown buckets fall through to S3 fallback.
    // S3 will fail because the binding is missing, but that's caught and re-thrown.
    await expect(headObject(cfEnv,'no-such-bucket', 'x')).rejects.toThrow();
  });
});

describe('deleteObject (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('removes existing object', async () => {
    await env.PRIMARY_BUCKET.put('to-delete.txt', 'bye');
    await deleteObject(cfEnv,BUCKET, 'to-delete.txt');
    expect(await env.PRIMARY_BUCKET.head('to-delete.txt')).toBeNull();
  });

  it('is idempotent for missing object', async () => {
    await expect(deleteObject(cfEnv,BUCKET, 'never-existed.txt')).resolves.toBeUndefined();
  });
});

describe('createMultipartUpload + abortMultipartUpload (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('returns non-empty upload_id and is abortable', async () => {
    const { upload_id } = await createMultipartUpload(cfEnv,BUCKET, 'big.bin', 'application/octet-stream');
    expect(upload_id).toBeTruthy();
    await expect(abortMultipartUpload(cfEnv,BUCKET, 'big.bin', upload_id)).resolves.toBeUndefined();
  });
});

describe('completeMultipartUpload (Miniflare R2 binding)', () => {
  beforeEach(clearBucket);

  it('strips quoted ETags and writes a real object (happy path, 2 parts)', async () => {
    const { upload_id } = await createMultipartUpload(cfEnv,BUCKET, 'merged.bin', 'application/octet-stream');
    const mpu = env.PRIMARY_BUCKET.resumeMultipartUpload('merged.bin', upload_id);
    const partA = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0xaa));
    const partB = await mpu.uploadPart(2, new Uint8Array(1024).fill(0xbb));

    const result = await completeMultipartUpload(cfEnv,BUCKET, 'merged.bin', upload_id, [
      { PartNumber: 1, ETag: `"${partA.etag}"` },
      { PartNumber: 2, ETag: `"${partB.etag}"` },
    ]);

    expect(result.etag).toBeTruthy();
    const head = await env.PRIMARY_BUCKET.head('merged.bin');
    expect(head).not.toBeNull();
    expect(head!.size).toBe(5 * 1024 * 1024 + 1024);
  });

  it('sorts unordered parts by PartNumber before complete', async () => {
    const { upload_id } = await createMultipartUpload(cfEnv,BUCKET, 'sorted.bin', 'application/octet-stream');
    const mpu = env.PRIMARY_BUCKET.resumeMultipartUpload('sorted.bin', upload_id);
    const p1 = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0x11));
    const p2 = await mpu.uploadPart(2, new Uint8Array(1024).fill(0x22));

    await expect(
      completeMultipartUpload(cfEnv,BUCKET, 'sorted.bin', upload_id, [
        { PartNumber: 2, ETag: p2.etag },
        { PartNumber: 1, ETag: p1.etag },
      ])
    ).resolves.toBeTruthy();
  });

  it('throws on empty parts', async () => {
    await expect(completeMultipartUpload(cfEnv,BUCKET, 'x.bin', 'fake-upload', [])).rejects.toThrow(
      /non-empty array/
    );
  });

  it('throws on duplicate PartNumber', async () => {
    await expect(
      completeMultipartUpload(cfEnv,BUCKET, 'x.bin', 'fake-upload', [
        { PartNumber: 1, ETag: 'a' },
        { PartNumber: 1, ETag: 'b' },
      ])
    ).rejects.toThrow(/duplicate PartNumber/);
  });

  it('throws on PartNumber out of range', async () => {
    await expect(
      completeMultipartUpload(cfEnv,BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 0, ETag: 'a' }])
    ).rejects.toThrow(/out of range/);
    await expect(
      completeMultipartUpload(cfEnv,BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 10001, ETag: 'a' }])
    ).rejects.toThrow(/out of range/);
  });

  it('throws on empty ETag', async () => {
    await expect(
      completeMultipartUpload(cfEnv,BUCKET, 'x.bin', 'fake-upload', [{ PartNumber: 1, ETag: '' }])
    ).rejects.toThrow(/empty ETag/);
  });

  it('does NOT call globalThis.fetch (no aws4fetch on happy path)', async () => {
    const { upload_id } = await createMultipartUpload(cfEnv,BUCKET, 'no-fetch.bin', 'application/octet-stream');
    const mpu = env.PRIMARY_BUCKET.resumeMultipartUpload('no-fetch.bin', upload_id);
    const part = await mpu.uploadPart(1, new Uint8Array(5 * 1024 * 1024).fill(0x33));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await completeMultipartUpload(cfEnv,BUCKET, 'no-fetch.bin', upload_id, [
        { PartNumber: 1, ETag: part.etag },
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('listUploadedParts (mocked fetch)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses single page and returns parts (with quoted ETags)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures['single-page.xml'], { status: 200, headers: { 'content-type': 'application/xml' } })
    ) as unknown as typeof globalThis.fetch;

    const parts = await listUploadedParts(cfEnv,BUCKET, 'k', 'U1');
    expect(parts).toHaveLength(3);
    expect(parts[0]!.ETag).toMatch(/^".+"$/);
  });

  it('paginates through 2 pages via NextPartNumberMarker', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response(calls === 1 ? fixtures['truncated.xml'] : fixtures['single-part.xml'], {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;

    const parts = await listUploadedParts(cfEnv,BUCKET, 'k', 'U1');
    expect(calls).toBe(2);
    expect(parts).toHaveLength(2);
  });

  it('throws after 10 pages', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures['truncated.xml'], { status: 200 })
    ) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(cfEnv,BUCKET, 'k', 'U1')).rejects.toThrow(/exceeded max iterations/);
  });

  it('throws with S3 error code on non-OK fetch', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(fixtures['s3-error.xml'], { status: 404 })
    ) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(cfEnv,BUCKET, 'k', 'U1')).rejects.toThrow(/404 NoSuchUpload/);
  });

  it('cancels response body on non-OK fetch', async () => {
    const cancel = vi.fn(async () => undefined);
    const fakeResponse = {
      ok: false,
      status: 404,
      text: async () => fixtures['s3-error.xml'],
      body: { cancel },
    } as unknown as Response;
    globalThis.fetch = vi.fn(async () => fakeResponse) as unknown as typeof globalThis.fetch;

    await expect(listUploadedParts(cfEnv,BUCKET, 'k', 'U1')).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('generatePresignedPutUrl / generatePresignedGetUrl', () => {
  it('returns SigV4 query-style URL with X-Amz-* params (PUT, default 3600s)', async () => {
    const result = await generatePresignedPutUrl(cfEnv,BUCKET, 'foo.bin', 'application/octet-stream');
    const u = new URL(result.presigned_url);
    expect(u.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(result.storage_key).toBe('foo.bin');
  });

  it('returns SigV4 query-style URL with custom expiresIn (GET, 900s)', async () => {
    const result = await generatePresignedGetUrl(cfEnv,BUCKET, 'foo.bin', 900);
    const u = new URL(result.presigned_url);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });

  it('can force browser downloads with a signed Content-Disposition override', async () => {
    const result = await generatePresignedGetUrl(cfEnv,BUCKET, 'foo.bin', 900, 'raport ą.pdf');
    const u = new URL(result.presigned_url);
    expect(u.searchParams.get('response-content-disposition')).toContain('attachment');
    expect(u.searchParams.get('response-content-disposition')).toContain("filename*=UTF-8''raport%20%C4%85.pdf");
  });
});

describe('signUploadPart', () => {
  it('preserves uploadId+partNumber in query and signs only host', async () => {
    const result = await signUploadPart(cfEnv,BUCKET, 'big.bin', 'ABC123', 7, 900);
    const u = new URL(result.url);
    expect(u.searchParams.get('uploadId')).toBe('ABC123');
    expect(u.searchParams.get('partNumber')).toBe('7');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });
});
