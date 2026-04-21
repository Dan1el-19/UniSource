import type { Folder, PublicFileAccessResponse, PublicFileLockedResponse } from '@unisource/sdk';
import { UnisourceClient } from '@unisource/sdk';
import { account } from './appwrite';

const apiUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';
const serviceId = import.meta.env.PUBLIC_SERVICE_ID || 'usrc';

export async function getAccessToken() {
  try {
    const session = await account.createJWT();
    return session.jwt;
  } catch {
    return null;
  }
}

export const apiClient = new UnisourceClient({
  baseUrl: apiUrl,
  serviceId,
  getToken: () => getAccessToken(),
});

export async function getFolderById(id: string): Promise<Folder> {
  const payload = await apiClient.folders.get(id);
  return payload.folder;
}

export async function downloadFileById(fileId: string, preferredFileName?: string) {
  const payload = await apiClient.myFiles.downloadUrl(fileId);

  const response = await fetch(payload.download_url);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.rel = 'noopener noreferrer';
  if (preferredFileName) {
    anchor.download = preferredFileName;
  }

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787';

export async function getPublicFileInfo(slug: string): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  const res = await fetch(`${PUBLIC_API_URL}/public/${encodeURIComponent(slug)}`, {
    headers: { 'Cache-Control': 'no-store' },
  });
  return res.json() as Promise<PublicFileAccessResponse | PublicFileLockedResponse>;
}

export async function unlockPublicFile(slug: string, password: string): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  const res = await fetch(`${PUBLIC_API_URL}/public/${encodeURIComponent(slug)}/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ password }),
  });
  return res.json() as Promise<PublicFileAccessResponse | PublicFileLockedResponse>;
}

