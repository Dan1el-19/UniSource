import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  type ListPartsCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


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

function createS3Client(env: CloudflareBindings): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export async function generatePresignedPutUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<PresignedUploadResult> {
  const client = createS3Client(env);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const presigned_url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const expires_at = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return { presigned_url, storage_key: key, expires_at };
}

export async function generatePresignedGetUrl(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  expiresInSeconds = 900
): Promise<PresignedDownloadResult> {
  const client = createS3Client(env);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const presigned_url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const expires_at = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return { presigned_url, storage_key: key, expires_at };
}

export async function deleteObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<void> {
  const client = createS3Client(env);
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await client.send(command);
}

export async function headObject(
  env: CloudflareBindings,
  bucket: string,
  key: string
): Promise<R2ObjectMeta | null> {
  const client = createS3Client(env);
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: result.ContentLength ?? 0 };
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

// ─── Multipart Upload ─────────────────────────────────────────────────────────

/**
 * Initiates an S3 multipart upload on R2. The returned `upload_id` (a.k.a. S3
 * UploadId) must be provided for every subsequent sign/complete/abort call.
 */
export async function createMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  contentType: string
): Promise<MultipartCreateResult> {
  const client = createS3Client(env);
  const result = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })
  );

  if (!result.UploadId) {
    throw new Error('R2 did not return an UploadId for CreateMultipartUpload');
  }

  return { upload_id: result.UploadId };
}

/**
 * Generates a short-lived presigned PUT URL for uploading a single part.
 * Browser uploads the raw bytes directly against this URL.
 */
export async function signUploadPart(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  partNumber: number,
  expiresInSeconds = 900
): Promise<MultipartSignPartResult> {
  const client = createS3Client(env);
  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  const expires_at = Math.floor(Date.now() / 1000) + expiresInSeconds;

  return { url, expires_at };
}

/**
 * Lists parts already uploaded against a multipart UploadId. Used by Uppy's
 * Golden Retriever to resume after a browser crash / tab close.
 */
export async function listUploadedParts(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<MultipartUploadedPart[]> {
  const client = createS3Client(env);
  const parts: MultipartUploadedPart[] = [];
  let partNumberMarker: string | undefined = undefined;

  // ListParts is paginated — at most 1000 parts per response.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result: ListPartsCommandOutput = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumberMarker: partNumberMarker,
      })
    );

    for (const part of result.Parts ?? []) {
      if (part.PartNumber !== undefined && part.ETag) {
        parts.push({
          PartNumber: part.PartNumber,
          ETag: part.ETag,
          Size: part.Size ?? 0,
        });
      }
    }

    if (!result.IsTruncated) break;
    partNumberMarker = result.NextPartNumberMarker;
    if (!partNumberMarker) break;
  }

  return parts;
}

/**
 * Finalises a multipart upload. The `parts` array must be ordered by PartNumber.
 */
export async function completeMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string,
  parts: MultipartPartInput[]
): Promise<MultipartCompleteResult> {
  const client = createS3Client(env);
  const ordered = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);

  const result = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: ordered.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    })
  );

  return { etag: result.ETag ?? null };
}

/**
 * Aborts a multipart upload. R2 auto-aborts after 7 days anyway, but calling
 * this promptly releases reserved storage.
 */
export async function abortMultipartUpload(
  env: CloudflareBindings,
  bucket: string,
  key: string,
  uploadId: string
): Promise<void> {
  const client = createS3Client(env);
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    })
  );
}
