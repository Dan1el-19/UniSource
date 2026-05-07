import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAppwriteFileMeta } from '../src/services/appwrite';

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
