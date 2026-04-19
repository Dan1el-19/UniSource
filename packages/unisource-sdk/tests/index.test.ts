import { describe, expect, it } from 'vitest';
import {
  fileRecordSchema,
  uploadAppwriteInitResponseSchema,
  uploadR2InitRequestSchema,
} from '../src';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('unisource-sdk schemas', () => {
  it('exposes importable built package entrypoint', async () => {
    const distEntry = resolve(process.cwd(), 'dist/index.mjs');
    expect(existsSync(distEntry)).toBe(true);

    const mod = await import(distEntry);
    expect(mod.uploadDestinationSchema).toBeDefined();
    expect(mod.fileRecordFullSchema).toBeDefined();
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
      id: 'upload-id',
      filename: 'obrazek.png',
      size: 50_000,
      mime_type: 'image/png',
      destination: 'r2',
      storage_key: 'uploads/2026/04/18/upload-id.png',
      bucket: 'unisource',
      status: 'completed',
      expires_at: 1_900_000_000,
      created_at: 1_800_000_000,
      updated_at: 1_800_000_010,
    });

    expect(parsed.success).toBe(true);
  });
});
