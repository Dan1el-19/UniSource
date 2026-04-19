// Appwrite mapping service
// This service provides parameters for direct client-side uploads.

export interface AppwriteUploadConfig {
  endpoint: string;
  project_id: string;
  bucket_id: string;
  file_id: string;
  expires_at: number;
}

interface AppwriteFileTokenPayload {
  secret?: string;
  expire?: string | number | null;
}

export interface AppwriteFileTokenResult {
  secret: string;
  expires_at: number;
}

export interface AppwriteDeleteFileResult {
  deleted: boolean;
  not_found: boolean;
}

const APPWRITE_RESPONSE_FORMAT = '1.8.0';

function normalizeAppwriteEndpoint(endpoint: string): string {
  return endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
}

function getAppwriteApiBaseUrl(env: CloudflareBindings): string {
  const normalizedEndpoint = normalizeAppwriteEndpoint(env.APPWRITE_ENDPOINT);
  return normalizedEndpoint.endsWith('/v1') ? normalizedEndpoint : `${normalizedEndpoint}/v1`;
}

function createAppwriteHeaders(env: CloudflareBindings): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Appwrite-Response-Format': APPWRITE_RESPONSE_FORMAT,
    'X-Appwrite-Project': env.APPWRITE_PROJECT_ID,
    'X-Appwrite-Key': env.APPWRITE_API_KEY,
  };
}

export function getAppwriteUploadConfig(
  env: CloudflareBindings,
  fileId: string,
  expiresInSeconds = 3600
): AppwriteUploadConfig {
  return {
    endpoint: env.APPWRITE_ENDPOINT,
    project_id: env.APPWRITE_PROJECT_ID,
    bucket_id: env.APPWRITE_BUCKET_ID,
    file_id: fileId,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
}

export function extractAppwriteFileIdFromStorageKey(storageKey: string): string | null {
  const segments = storageKey.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return segments[segments.length - 1] ?? null;
}

export async function createAppwriteFileToken(
  env: CloudflareBindings,
  bucketId: string,
  fileId: string,
  expiresInSeconds = 900
): Promise<AppwriteFileTokenResult> {
  const baseUrl = getAppwriteApiBaseUrl(env);
  const targetUrl = `${baseUrl}/tokens/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const expire = new Date(expiresAt * 1000).toISOString();

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: createAppwriteHeaders(env),
    body: JSON.stringify({ expire }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Appwrite create token failed (${response.status}): ${errorBody}`);
  }

  const payload = await response.json<AppwriteFileTokenPayload>();
  if (!payload.secret || typeof payload.secret !== 'string') {
    throw new Error('Appwrite create token response is missing secret');
  }

  let tokenExpiry = expiresAt;
  if (typeof payload.expire === 'number' && Number.isFinite(payload.expire)) {
    tokenExpiry = Math.floor(payload.expire);
  } else if (typeof payload.expire === 'string') {
    const parsedExpiry = Date.parse(payload.expire);
    if (!Number.isNaN(parsedExpiry)) {
      tokenExpiry = Math.floor(parsedExpiry / 1000);
    }
  }

  return {
    secret: payload.secret,
    expires_at: tokenExpiry,
  };
}

export function buildAppwriteFileDownloadUrl(
  env: CloudflareBindings,
  bucketId: string,
  fileId: string,
  token: string
): string {
  const baseUrl = getAppwriteApiBaseUrl(env);
  const downloadUrl = new URL(
    `${baseUrl}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/download`
  );

  downloadUrl.searchParams.set('token', token);
  return downloadUrl.toString();
}

export async function deleteAppwriteFile(
  env: CloudflareBindings,
  bucketId: string,
  fileId: string
): Promise<AppwriteDeleteFileResult> {
  const baseUrl = getAppwriteApiBaseUrl(env);
  const targetUrl = `${baseUrl}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}`;

  const response = await fetch(targetUrl, {
    method: 'DELETE',
    headers: createAppwriteHeaders(env),
  });

  if (response.status === 404) {
    return { deleted: false, not_found: true };
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Appwrite delete file failed (${response.status}): ${errorBody}`);
  }

  return { deleted: true, not_found: false };
}
