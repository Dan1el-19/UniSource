import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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
