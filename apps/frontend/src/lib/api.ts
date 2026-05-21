import { env } from '$env/dynamic/private';

const API_BASE = () => `${env.API_BASE ?? 'https://api.usrc.dev'}/superadmin`;

export type Permission =
  | 'upload'
  | 'files:read'
  | 'files:delete'
  | 'shares'
  | 'releases'
  | 'main_storage'
  | 'admin';

export interface Service {
  id: string;
  name: string;
  default_bucket: string;
  max_storage_bytes: number;
  current_used_bytes: number;
  main_used_bytes: number;
  max_file_size_bytes: number;
  recommended_upload_destination: 'r2' | 'appwrite' | 'hybrid';
  object_key_prefix: string;
  cloudflare_config: Record<string, unknown> | null;
  created_at: number;
}

export interface ApiKey {
  id: string;
  service_id: string;
  name: string;
  key_prefix: string;
  permissions: Permission[];
  cors_origins: string[] | null;
  is_account_level: boolean;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
  created_at: number;
  plaintext_key?: string;
}

export interface AccountKey extends ApiKey {
  service_ids: string[];
}

async function apiFetch<T>(
  path: string,
  request: Request,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const clientId = env.CF_ACCESS_CLIENT_ID;
  const clientSecret = env.CF_ACCESS_CLIENT_SECRET;
  if (clientId && clientSecret) {
    headers['CF-Access-Client-Id'] = clientId;
    headers['CF-Access-Client-Secret'] = clientSecret;
  } else {
    const cfJwt = request.headers.get('Cf-Access-Jwt-Assertion');
    const cookieHeader = request.headers.get('Cookie') ?? '';
    if (cfJwt) headers['Cf-Access-Jwt-Assertion'] = cfJwt;
    else if (cookieHeader) headers['Cookie'] = cookieHeader;
  }

  const res = await fetch(`${API_BASE()}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Services ─────────────────────────────────────────────────────────────────

export const listServices = (req: Request) =>
  apiFetch<{ services: Service[] }>('/services', req);

export const getService = (req: Request, id: string) =>
  apiFetch<{ service: Service }>(`/services/${id}`, req);

export const createService = (req: Request, body: Partial<Service>) =>
  apiFetch<{ service: Service }>('/services', req, { method: 'POST', body: JSON.stringify(body) });

export const patchService = (req: Request, id: string, body: Partial<Service>) =>
  apiFetch<{ service: Service }>(`/services/${id}`, req, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteService = (req: Request, id: string) =>
  apiFetch<{ deleted: boolean }>(`/services/${id}`, req, { method: 'DELETE' });

// ─── Service API keys ─────────────────────────────────────────────────────────

export const listServiceKeys = (req: Request, serviceId: string) =>
  apiFetch<{ keys: ApiKey[] }>(`/services/${serviceId}/api-keys`, req);

export const createServiceKey = (
  req: Request,
  serviceId: string,
  body: { name: string; permissions: Permission[]; cors_origins?: string[]; expires_at?: number }
) =>
  apiFetch<{ key: ApiKey }>(`/services/${serviceId}/api-keys`, req, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const patchServiceKey = (
  req: Request,
  serviceId: string,
  keyId: string,
  body: { name?: string; permissions?: Permission[] }
) =>
  apiFetch<{ key: ApiKey }>(`/services/${serviceId}/api-keys/${keyId}`, req, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const revokeServiceKey = (req: Request, serviceId: string, keyId: string) =>
  apiFetch<{ revoked: boolean }>(`/services/${serviceId}/api-keys/${keyId}`, req, { method: 'DELETE' });

export const rotateServiceKey = (req: Request, serviceId: string, keyId: string) =>
  apiFetch<{ key: ApiKey }>(`/services/${serviceId}/api-keys/${keyId}/rotate`, req, { method: 'POST' });

// ─── Account keys ─────────────────────────────────────────────────────────────

export const listAccountKeys = (req: Request) =>
  apiFetch<{ keys: AccountKey[] }>('/account-keys', req);

export const createAccountKey = (
  req: Request,
  body: { name: string; permissions: Permission[]; service_ids: string[]; expires_at?: number }
) =>
  apiFetch<{ key: AccountKey }>('/account-keys', req, { method: 'POST', body: JSON.stringify(body) });

export const patchAccountKey = (
  req: Request,
  keyId: string,
  body: { name?: string; permissions?: Permission[]; service_ids?: string[] }
) =>
  apiFetch<{ key: AccountKey }>(`/account-keys/${keyId}`, req, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const revokeAccountKey = (req: Request, keyId: string) =>
  apiFetch<{ revoked: boolean }>(`/account-keys/${keyId}`, req, { method: 'DELETE' });

// ─── CORS ─────────────────────────────────────────────────────────────────────

export const getServiceCors = (req: Request, serviceId: string) =>
  apiFetch<{ origins: string[] }>(`/services/${serviceId}/cors`, req);

export const putServiceCors = (req: Request, serviceId: string, origins: string[]) =>
  apiFetch<{ origins: string[] }>(`/services/${serviceId}/cors`, req, {
    method: 'PUT',
    body: JSON.stringify({ origins }),
  });

// ─── Cloudflare config ────────────────────────────────────────────────────────

export const getCloudflareConfig = (req: Request, serviceId: string) =>
  apiFetch<{ cloudflare_config: Record<string, unknown> | null }>(`/services/${serviceId}/cloudflare`, req);

export const patchCloudflareConfig = (req: Request, serviceId: string, config: Record<string, unknown>) =>
  apiFetch<{ cloudflare_config: Record<string, unknown> }>(`/services/${serviceId}/cloudflare`, req, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
