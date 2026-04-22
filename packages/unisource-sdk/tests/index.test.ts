import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminServiceUpdateRequestSchema,
  fileRecordSchema,
  folderListQuerySchema,
  getPublicFileInfo,
  unlockPublicFile,
  UnisourceClient,
  UnisourceError,
  uploadAppwriteInitResponseSchema,
  uploadRecordDetailResponseSchema,
  uploadRecordSchema,
  uploadR2InitRequestSchema,
  shareLinkUpdateRequestSchema,
  FILES_MAX_LIMIT,
} from '../src';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unisource-sdk schemas', () => {
  it('exposes importable built package entrypoint', async () => {
    const distEntry = resolve(process.cwd(), 'dist/index.mjs');
    expect(existsSync(distEntry)).toBe(true);

    const mod = await import(distEntry);
    expect(mod.uploadDestinationSchema).toBeDefined();
    expect(mod.fileRecordSchema).toBeDefined();
    expect(mod.getPublicFileInfo).toBeDefined();
  });

  it('accepts valid R2 init request payload', () => {
    const parsed = uploadR2InitRequestSchema.safeParse({
      filename: 'raport.pdf',
      size: 1024,
      mime_type: 'application/pdf',
      bucket: 'unisource',
    });

    expect(parsed.success).toBe(true);
  });

  it('rejects empty filename in upload payload', () => {
    const parsed = uploadR2InitRequestSchema.safeParse({
      filename: '  ',
      size: 1024,
      mime_type: 'application/pdf',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts valid Appwrite init response payload', () => {
    const parsed = uploadAppwriteInitResponseSchema.safeParse({
      upload_id: 'uuid-upload',
      destination: 'appwrite',
      appwrite_endpoint: 'https://eu-central-1.cloud.appwrite.io/v1',
      appwrite_project_id: 'project-id',
      appwrite_bucket_id: 'bucket-id',
      file_id: 'file-id',
      expires_at: 1_900_000_000,
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts valid file record', () => {
    const parsed = fileRecordSchema.safeParse({
      id: 'file-id',
      service_id: 'usrc',
      user_id: 'user-1',
      folder_id: null,
      upload_id: 'upload-id',
      filename: 'obrazek.png',
      size: 50_000,
      mime_type: 'image/png',
      storage_destination: 'r2',
      is_trashed: false,
      trashed_at: null,
      created_at: 1_800_000_000,
      updated_at: 1_800_000_010,
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts folder trash query with canonical and deprecated aliases', () => {
    expect(folderListQuerySchema.parse({ trashed: true })).toMatchObject({ trashed: true });
    expect(folderListQuerySchema.parse({ is_trashed: true })).toMatchObject({ is_trashed: true });
  });

  it('folderListQuerySchema rejects when both trashed and is_trashed provided', () => {
    expect(
      folderListQuerySchema.safeParse({ trashed: true, is_trashed: false }).success
    ).toBe(false);
    // Każde z osobna jest OK
    expect(folderListQuerySchema.safeParse({ trashed: true }).success).toBe(true);
    expect(folderListQuerySchema.safeParse({ is_trashed: true }).success).toBe(true);
  });

  it('folderListQuerySchema rejects limit above FILES_MAX_LIMIT', () => {
    expect(folderListQuerySchema.safeParse({ limit: FILES_MAX_LIMIT + 1 }).success).toBe(false);
    expect(folderListQuerySchema.safeParse({ limit: FILES_MAX_LIMIT }).success).toBe(true);
  });

  it('accepts valid upload detail response payload', () => {
    const parsed = uploadRecordDetailResponseSchema.safeParse({
      upload: {
        id: 'upload-id',
        service_id: 'usrc',
        user_id: null,
        filename: 'raport.pdf',
        size: 1024,
        mime_type: 'application/pdf',
        destination: 'r2',
        status: 'completed',
        expires_at: 1_900_000_000,
        created_at: 1_800_000_000,
        updated_at: 1_800_000_010,
      },
    });

    expect(parsed.success).toBe(true);
  });

  it('uploadRecordSchema.status rejects values outside uploadStatusSchema', () => {
    const base = {
      id: 'u1',
      service_id: 'svc',
      user_id: null,
      filename: 'a.pdf',
      size: 100,
      mime_type: 'application/pdf',
      destination: 'r2',
      expires_at: 1_900_000_000,
      created_at: 1_800_000_000,
      updated_at: 1_800_000_010,
    };
    expect(uploadRecordSchema.safeParse({ ...base, status: 'completed' }).success).toBe(true);
    expect(uploadRecordSchema.safeParse({ ...base, status: 'archived' }).success).toBe(false);
  });

  it('adminServiceUpdateRequestSchema allows partial update', () => {
    // Only one of the fields should be sufficient
    expect(
      adminServiceUpdateRequestSchema.safeParse({
        max_storage_bytes: 10_000_000_000,
      }).success
    ).toBe(true);

    expect(
      adminServiceUpdateRequestSchema.safeParse({
        max_file_size_bytes: 500_000_000,
      }).success
    ).toBe(true);

    // Empty object should FAIL
    expect(adminServiceUpdateRequestSchema.safeParse({}).success).toBe(false);
  });

  it('shareLinkUpdateRequestSchema rejects empty object', () => {
    expect(shareLinkUpdateRequestSchema.safeParse({}).success).toBe(false);
    expect(shareLinkUpdateRequestSchema.safeParse({ is_active: false }).success).toBe(true);
    expect(shareLinkUpdateRequestSchema.safeParse({ name: null }).success).toBe(true);
  });
});

describe('unisource-sdk HTTP helpers', () => {
  it('calls public share endpoints without auth headers', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          file_id: 'file-1',
          filename: 'share.pdf',
          size: 2048,
          mime_type: 'application/pdf',
          requires_password: false,
          download_url: 'https://example.com/share.pdf',
          url_expires_at: 1_900_000_000,
          link_name: null,
          link_expires_at: null,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await getPublicFileInfo('https://api.example.com', 'share slug');
    await unlockPublicFile('https://api.example.com', 'share slug', 'sekret');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/public/share%20slug',
      expect.objectContaining({ method: 'GET', headers: {} })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/public/share%20slug/unlock',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'sekret' }),
      })
    );
  });

  it('exposes admin methods for /files endpoints', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/files/upload-1') && init?.method === 'DELETE') {
        return new Response(
          JSON.stringify({ success: true, id: 'upload-1', permanent: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/files/upload-1')) {
        return new Response(
          JSON.stringify({
            upload: {
              id: 'upload-1',
              service_id: 'usrc',
              user_id: null,
              filename: 'raport.pdf',
              size: 1024,
              mime_type: 'application/pdf',
              destination: 'r2',
              status: 'completed',
              expires_at: 1_900_000_000,
              created_at: 1_800_000_000,
              updated_at: 1_800_000_010,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/files/upload-1/download-url')) {
        return new Response(
          JSON.stringify({
            upload_id: 'upload-1',
            destination: 'r2',
            download_url: 'https://example.com/download.pdf',
            expires_at: 1_900_000_000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new UnisourceClient({
      baseUrl: 'https://api.example.com',
      serviceId: 'usrc',
      getToken: async () => 'jwt-token',
    });

    const detail = await client.admin.getUpload('upload-1');
    const download = await client.admin.downloadUploadUrl('upload-1');
    const deletion = await client.admin.deleteUpload('upload-1');

    expect(detail.upload.id).toBe('upload-1');
    expect(download.download_url).toContain('download.pdf');
    expect(deletion).toMatchObject({ success: true, id: 'upload-1', permanent: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/files/upload-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-Service-ID': 'usrc',
          Authorization: 'Bearer jwt-token',
        }),
      })
    );
  });

  it('throws typed errors for failed public requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Unauthorized', message: 'Incorrect password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(unlockPublicFile('https://api.example.com', 'share', 'bad-pass')).rejects.toBeInstanceOf(
      UnisourceError
    );
  });

  it('passes AbortSignal to trash and folders.get requests', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return new Response(
        JSON.stringify({ items: [], next_cursor: null, limit: 25 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new UnisourceClient({
      baseUrl: 'https://api.example.com',
      serviceId: 'usrc',
      getToken: async () => 'tok',
    });

    await client.myFiles.trash(undefined, controller.signal);
    await client.folders.get('folder-1', controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
