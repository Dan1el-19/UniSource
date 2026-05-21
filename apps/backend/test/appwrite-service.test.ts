import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAppwriteFileDownloadUrl,
  createAppwriteFileToken,
  getAppwriteFileMeta,
} from '../src/services/appwrite';

const mockEnv = {
  APPWRITE_ENDPOINT: 'https://appwrite.example.com/v1',
  APPWRITE_PROJECT_ID: 'proj123',
  APPWRITE_API_KEY: 'key123',
} as unknown as CloudflareBindings;

describe('getAppwriteFileMeta', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns file size when file exists', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sizeOriginal: 2048, $id: 'file-abc' }),
    } as unknown as Response);

    const result = await getAppwriteFileMeta(mockEnv, 'bucket-id', 'file-abc');
    expect(result).toEqual({ size: 2048 });
  });

  it('returns null when file does not exist (404)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    const result = await getAppwriteFileMeta(mockEnv, 'bucket-id', 'missing-id');
    expect(result).toBeNull();
  });

  it('throws when Appwrite returns non-404 error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as unknown as Response);

    await expect(getAppwriteFileMeta(mockEnv, 'bucket-id', 'file-id')).rejects.toThrow(
      'Appwrite getFileMeta failed (500)'
    );
  });

  it('sends correct Appwrite headers', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ sizeOriginal: 512 }),
    } as unknown as Response);
    global.fetch = fetchSpy;

    await getAppwriteFileMeta(mockEnv, 'my-bucket', 'my-file');

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/storage/buckets/my-bucket/files/my-file');
    expect((options.headers as Record<string, string>)['X-Appwrite-Key']).toBe('key123');
    expect((options.headers as Record<string, string>)['X-Appwrite-Project']).toBe('proj123');
  });
});

describe('createAppwriteFileToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('deletes expired Appwrite file tokens before creating a fresh download token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'));

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tokens: [
            { $id: 'expired-token', expire: '2026-05-16T11:59:59.000Z' },
            { $id: 'active-token', expire: '2026-05-16T12:10:00.000Z' },
          ],
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ secret: 'fresh-secret', expire: '2026-05-16T12:15:00.000Z' }),
      } as unknown as Response);
    global.fetch = fetchSpy;

    const result = await createAppwriteFileToken(mockEnv, 'bucket-id', 'file-id', 900);

    expect(result).toEqual({ secret: 'fresh-secret', expires_at: 1778933700 });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'https://appwrite.example.com/v1/tokens/buckets/bucket-id/files/file-id?total=false',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'https://appwrite.example.com/v1/tokens/expired-token',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      'https://appwrite.example.com/v1/tokens/buckets/bucket-id/files/file-id',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('buildAppwriteFileDownloadUrl', () => {
  it('includes the project query parameter required by browser Storage URLs', () => {
    const url = new URL(buildAppwriteFileDownloadUrl(mockEnv, 'bucket-id', 'file-id', 'secret-token'));

    expect(url.pathname).toBe('/v1/storage/buckets/bucket-id/files/file-id/download');
    expect(url.searchParams.get('token')).toBe('secret-token');
    expect(url.searchParams.get('project')).toBe('proj123');
  });
});
