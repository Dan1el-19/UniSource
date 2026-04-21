import type { Folder } from '@unisource/sdk';
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
