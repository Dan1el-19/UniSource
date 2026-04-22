import { env as publicEnv } from '$env/dynamic/public';
import type { Folder, PublicFileAccessResponse, PublicFileLockedResponse } from '@unisource/sdk';
import { UnisourceClient, getPublicFileInfo as getPublicFileInfoFromSdk, unlockPublicFile as unlockPublicFileFromSdk } from '@unisource/sdk';
import { account } from './appwrite';

const apiUrl = publicEnv.PUBLIC_API_URL || 'http://localhost:8787';
const serviceId = publicEnv.PUBLIC_SERVICE_ID || 'usrc';

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

const publicApiUrl = publicEnv.PUBLIC_API_URL || 'http://localhost:8787';

export async function getPublicFileInfo(slug: string): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return getPublicFileInfoFromSdk(publicApiUrl, slug);
}

export async function unlockPublicFile(slug: string, password: string): Promise<PublicFileAccessResponse | PublicFileLockedResponse> {
  return unlockPublicFileFromSdk(publicApiUrl, slug, password);
}

