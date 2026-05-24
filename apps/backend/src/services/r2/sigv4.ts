import { AwsClient } from 'aws4fetch';

export function createR2SigningClient(env: CloudflareBindings): AwsClient {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

export function resolveR2BucketName(env: CloudflareBindings, bucketKey: string): string {
  const raw = (env as unknown as { R2_BUCKET_NAMES?: string }).R2_BUCKET_NAMES;
  if (!raw) {
    throw new Error(`R2 bucket name not configured for bucket key: ${bucketKey}`);
  }

  let bucketNames: Record<string, string>;
  try {
    bucketNames = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error('R2_BUCKET_NAMES must be valid JSON');
  }

  const bucketName = bucketNames[bucketKey];
  if (!bucketName) {
    throw new Error(`R2 bucket name not configured for bucket key: ${bucketKey}`);
  }

  return bucketName;
}

/**
 * Build a path-style R2 object URL.
 * Each `/`-separated segment is URI-encoded; the slashes are preserved.
 */
export function r2ObjectUrl(env: CloudflareBindings, bucketKey: string, key: string): string {
  const bucketName = resolveR2BucketName(env, bucketKey);
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://${host}/${encodeURIComponent(bucketName)}/${path}`;
}

/**
 * Sign a URL with SigV4 query-string mode (presigned URL).
 * Caller passes any extra query params in `url`; this function adds X-Amz-Expires
 * before signing so they are included in the canonical request.
 *
 * `allHeaders: false` ensures only `host` is signed — Content-Type from the
 * actual PUT request will NOT need to match the signature.
 */
export async function presign(
  client: AwsClient,
  url: string,
  method: 'GET' | 'HEAD' | 'PUT',
  expiresInSeconds: number
): Promise<string> {
  const u = new URL(url);
  u.searchParams.set('X-Amz-Expires', String(expiresInSeconds));
  const signed = await client.sign(u.toString(), {
    method,
    aws: { signQuery: true, allHeaders: false },
  });
  return signed.url.toString();
}
