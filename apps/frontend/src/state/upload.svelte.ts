import { Storage } from 'appwrite';
import { UnisourceError, UnisourceNetworkError, type UploadAppwriteInitResponse } from '@unisource/sdk';
import { apiClient } from '../lib/api';
import { client as appwriteClient } from '../lib/appwrite';

type UploadPhase = 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'success' | 'failed';

export type StorageProvider = 'r2' | 'appwrite';

const PROVIDER_KEY = 'drive:storage-provider';

export function getStorageProvider(): StorageProvider {
  if (typeof localStorage === 'undefined') return 'r2';
  const saved = localStorage.getItem(PROVIDER_KEY);
  return saved === 'appwrite' ? 'appwrite' : 'r2';
}

export function setStorageProvider(provider: StorageProvider): void {
  localStorage.setItem(PROVIDER_KEY, provider);
}

class UploadUiState {
  phase = $state<UploadPhase>('idle');
  progress = $state(0);
  fileName = $state('');
  message = $state<string | null>(null);
  error = $state<string | null>(null);
  activeUploadId = $state<string | null>(null);
  queueTotal = $state(0);
  queueCompleted = $state(0);

  reset() {
    this.phase = 'idle';
    this.progress = 0;
    this.fileName = '';
    this.message = null;
    this.error = null;
    this.activeUploadId = null;
    this.queueTotal = 0;
    this.queueCompleted = 0;
  }

  private setError(error: unknown) {
    if (error instanceof UnisourceError) {
      this.error = `Błąd ${error.status}: ${error.body.message}`;
      return;
    }

    if (error instanceof UnisourceNetworkError) {
      this.error = 'Błąd sieci. Sprawdź połączenie internetowe i spróbuj ponownie.';
      return;
    }

    if (error instanceof Error) {
      this.error = error.message;
      return;
    }

    this.error = 'Wystąpił nieznany błąd uploadu.';
  }

  private async uploadToR2(
    presignedUrl: string,
    file: File,
    onProgress: (ratio: number) => void
  ) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(event.loaded / event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        reject(new Error(`Upload storage error (${xhr.status})`));
      };

      xhr.onerror = () => reject(new Error('Upload storage network error'));
      xhr.onabort = () => reject(new Error('Upload aborted'));
      xhr.send(file);
    });
  }

  private async uploadToAppwrite(
    init: UploadAppwriteInitResponse,
    file: File,
    onProgress: (ratio: number) => void
  ) {
    const storage = new Storage(appwriteClient);

    await storage.createFile(
      init.appwrite_bucket_id,
      init.file_id,
      file,
      undefined,
      (progress) => {
        onProgress(progress.progress / 100);
      }
    );
  }

  async uploadFiles(files: File[] | FileList, targetFolderId: string | null) {
    const queue = Array.from(files);
    if (queue.length === 0) {
      return 0;
    }

    this.queueTotal = queue.length;
    this.queueCompleted = 0;
    this.message = null;
    this.error = null;

    const provider = getStorageProvider();
    let successCount = 0;

    for (const file of queue) {
      this.phase = 'preparing';
      this.fileName = file.name;
      this.progress = 4;

      let uploadId: string | null = null;

      try {
        if (provider === 'appwrite') {
          const init = await apiClient.upload.appwriteInit({
            filename: file.name,
            size: file.size,
            mime_type: file.type || 'application/octet-stream',
            folder_id: targetFolderId ?? undefined,
          });

          uploadId = init.upload_id;
          this.activeUploadId = uploadId;
          this.phase = 'uploading';

          await this.uploadToAppwrite(init, file, (ratio) => {
            const normalized = Math.round(ratio * 88);
            this.progress = Math.max(8, normalized);
          });

          this.phase = 'finalizing';
          this.progress = 94;

          await apiClient.upload.complete({ upload_id: init.upload_id });
        } else {
          const init = await apiClient.upload.r2Init({
            filename: file.name,
            size: file.size,
            mime_type: file.type || 'application/octet-stream',
            folder_id: targetFolderId ?? undefined,
          });

          uploadId = init.upload_id;
          this.activeUploadId = uploadId;
          this.phase = 'uploading';

          await this.uploadToR2(init.presigned_url, file, (ratio) => {
            const normalized = Math.round(ratio * 88);
            this.progress = Math.max(8, normalized);
          });

          this.phase = 'finalizing';
          this.progress = 94;

          await apiClient.upload.complete({ upload_id: init.upload_id });
        }

        this.progress = 100;
        this.phase = 'success';
        this.queueCompleted += 1;
        successCount += 1;
        this.message = `Wgrano: ${file.name}`;
      } catch (error) {
        this.phase = 'failed';
        this.setError(error);

        if (uploadId) {
          try {
            await apiClient.upload.fail({ upload_id: uploadId });
          } catch {
            // Ignore best-effort rollback failures.
          }
        }
      }
    }

    if (successCount > 0 && successCount === this.queueTotal) {
      this.message = this.queueTotal > 1
        ? `Wgrano ${this.queueTotal} pliki.`
        : 'Wgrywanie zakończone.';
    }

    this.activeUploadId = null;
    return successCount;
  }
}

export const uploadUiState = new UploadUiState();
