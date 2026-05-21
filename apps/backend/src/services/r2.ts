import { SERVICES } from '../config/services';
import {
  createR2SigningClient,
  r2ObjectUrl,
  presign,
} from './r2/sigv4';
import { parseListPartsResponse, parseS3ErrorCode } from './r2/list-parts-xml';

export interface PresignedUploadResult {
  presigned_url: string;
  storage_key: string;
  expires_at: number;
}

export interface PresignedDownloadResult {
  presigned_url: string;
  storage_key: string;
  expires_at: number;
}

export interface R2ObjectMeta {
  size: number;
}

export interface MultipartCreateResult {
  upload_id: string;
}

export interface MultipartSignPartResult {
  url: string;
  expires_at: number;
}

export interface MultipartUploadedPart {
  PartNumber: number;
  ETag: string;
  Size: number;
}

export interface MultipartPartInput {
  PartNumber: number;
  ETag: string;
}

export interface MultipartCompleteResult {
  etag: string | null;
}

const LIST_PARTS_MAX_PAGES = 10;

/**
 * Resolve the R2Bucket binding for a given bucket name by walking the
 * SERVICES map. Throws if the bucket is unknown or the binding is not
 * configured in the worker — defence-in-depth against accidental
 * cross-bucket access.
 */
function serviceByBucketName(bucketName: string) {
  for (const svc of Object.values(SERVICES)) {
    if (svc.bucketName === bucketName) {
      return svc;
    }
  }
  throw new Error(`Unknown R2 bucket: ${bucketName} (not in SERVICES map)`);
}

function bindingByBucketName(env: CloudflareBindings, bucketName: string): R2Bucket {
  const svc = serviceByBucketName(bucketName);
  const binding = (env as unknown as Record<string, R2Bucket | undefined>)[svc.bucketEnvKey];
  if (!binding) {
    throw new Error(`R2 binding not configured: ${svc.bucketEnvKey}`);
  }
  return binding;
}

// ─── Object operations (R2 binding) ───────────────────────────────────────────

export async function headObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<R2ObjectMeta | null> {
  const svc = serviceByBucketName(bucket);
  const binding = (env as unknown as Record<string, R2Bucket | undefined>)[svc.bucketEnvKey];
  const obj = binding ? await binding.head(key) : null;
  if (obj) return { size: obj.size };
  return headObjectViaS3(env, bucket, key);
}

export async function deleteObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<void> {
  await bindingByBucketName(env, bucket).delete(key);
}

// ─── Presigned URLs (aws4fetch SigV4) ─────────────────────────────────────────

export async function generatePresignedPutUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  _contentType: string,
  expiresInSeconds = 3600
): Promise<PresignedUploadResult> {
  // Content-Type intentionally NOT signed — clients send their own at PUT time.
  // SignedHeaders=host only.
  const client = createR2SigningClient(env);
  const presigned_url = await presign(client, r2ObjectUrl(env, bucket, key), 'PUT', expiresInSeconds);
  return {
    presigned_url,
    storage_key: key,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

export async function generatePresignedGetUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  expiresInSeconds = 900,
  filename?: string
): Promise<PresignedDownloadResult> {
  const client = createR2SigningClient(env);
  const url = new URL(r2ObjectUrl(env, bucket, key));
  if (filename) {
    url.searchParams.set('response-content-disposition', buildAttachmentDisposition(filename));
  }
  const presigned_url = await presign(client, url.toString(), 'GET', expiresInSeconds);
  return {
    presigned_url,
    storage_key: key,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

async function headObjectViaS3(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<R2ObjectMeta | null> {
  const client = createR2SigningClient(env);
  const url = await presign(client, r2ObjectUrl(env, bucket, key), 'HEAD', 60);
  const response = await fetch(url, { method: 'HEAD' });

  if (response.status === 404) {
    response.body?.cancel().catch(() => undefined);
    return null;
  }

  if (!response.ok) {
    response.body?.cancel().catch(() => undefined);
    throw new Error(`HeadObject failed: ${response.status}`);
  }

  const contentLength = response.headers.get('Content-Length');
  const size = Number(contentLength);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error('HeadObject failed: missing or invalid Content-Length');
  }

  return { size };
}

// ─── Multipart Upload ─────────────────────────────────────────────────────────

export async function createMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  contentType: string
): Promise<MultipartCreateResult> {
  const mpu = await bindingByBucketName(env, bucket).createMultipartUpload(key, {
    httpMetadata: { contentType },
  });
  return { upload_id: mpu.uploadId };
}

export async function signUploadPart(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 900
): Promise<MultipartSignPartResult> {
  const client = createR2SigningClient(env);
  const baseUrl = r2ObjectUrl(env, bucket, key);
  const partUrl = `${baseUrl}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
  const url = await presign(client, partUrl, 'PUT', expiresInSeconds);
  return {
    url,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

/**
 * Recovery-only. Used by Uppy Golden Retriever resume after browser crash.
 * Each page costs ~5–10 ms CPU on Workers Free plan — keep off the happy path.
 *
 * Hard cap: LIST_PARTS_MAX_PAGES (10). Over the cap → throw; client falls
 * back to fresh upload.
 */
export async function listUploadedParts(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<MultipartUploadedPart[]> {
  const client = createR2SigningClient(env);
  const baseUrl = r2ObjectUrl(env, bucket, key);
  const parts: MultipartUploadedPart[] = [];
  let partNumberMarker: string | undefined = undefined;

  for (let page = 0; page < LIST_PARTS_MAX_PAGES; page++) {
    const u = new URL(baseUrl);
    u.searchParams.set('uploadId', uploadId);
    u.searchParams.set('max-parts', '1000');
    if (partNumberMarker) u.searchParams.set('part-number-marker', partNumberMarker);

    const response = await client.fetch(u.toString(), { method: 'GET' });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const code = parseS3ErrorCode(body);
      // Free up the resp body if not consumed — Cloudflare best practice.
      response.body?.cancel().catch(() => undefined);
      throw new Error(`ListParts failed: ${response.status}${code ? ' ' + code : ''}`);
    }

    const xml = await response.text();
    const parsed = parseListPartsResponse(xml);
    for (const p of parsed.parts) {
      parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size });
    }
    if (!parsed.isTruncated || !parsed.nextPartNumberMarker) break;
    partNumberMarker = parsed.nextPartNumberMarker;
    if (page === LIST_PARTS_MAX_PAGES - 1) {
      throw new Error(
        `listUploadedParts exceeded max iterations (${LIST_PARTS_MAX_PAGES} pages × 1000 parts)`
      );
    }
  }

  return parts;
}

export async function completeMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  parts: MultipartPartInput[]
): Promise<MultipartCompleteResult> {
  validatePartsForComplete(parts);

  const ordered = parts
    .slice()
    .sort((a, b) => a.PartNumber - b.PartNumber)
    .map((p) => ({
      partNumber: p.PartNumber,
      etag: p.ETag.replace(/^\"|\"$/g, ''),
    }));

  const mpu = bindingByBucketName(env, bucket).resumeMultipartUpload(key, uploadId);
  const obj = await mpu.complete(ordered);
  return { etag: obj.httpEtag ?? null };
}

export async function abortMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<void> {
  const mpu = bindingByBucketName(env, bucket).resumeMultipartUpload(key, uploadId);
  await mpu.abort();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validatePartsForComplete(parts: MultipartPartInput[]): void {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('completeMultipartUpload: parts must be a non-empty array');
  }
  const seen = new Set<number>();
  for (const p of parts) {
    if (!Number.isInteger(p.PartNumber) || p.PartNumber < 1 || p.PartNumber > 10000) {
      throw new Error(`completeMultipartUpload: PartNumber out of range (1..10000): ${p.PartNumber}`);
    }
    if (seen.has(p.PartNumber)) {
      throw new Error(`completeMultipartUpload: duplicate PartNumber ${p.PartNumber}`);
    }
    seen.add(p.PartNumber);
    if (typeof p.ETag !== 'string' || p.ETag.length === 0) {
      throw new Error(`completeMultipartUpload: empty ETag for PartNumber ${p.PartNumber}`);
    }
  }
}

function buildAttachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
