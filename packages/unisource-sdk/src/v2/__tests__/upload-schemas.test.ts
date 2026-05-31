import { describe, it, expect } from 'vitest'
import {
  v2UploadR2InitResponseSchema,
  v2UploadAppwriteInitResponseSchema,
  v2UploadLifecycleResponseSchema,
  v2MultipartCreateResponseSchema,
  v2MultipartSignPartQuerySchema,
  v2MultipartListPartsResponseSchema,
  v2MultipartCompleteRequestSchema,
} from '../upload-schemas'

describe('v2 upload schemas', () => {
  it('parses R2 init response with { item } envelope', () => {
    const parsed = v2UploadR2InitResponseSchema.parse({
      item: {
        upload_id: 'abc',
        destination: 'r2',
        presigned_url: 'https://example.com/put',
        storage_key: 'svc/2026/01/01/abc.bin',
        bucket: 'unisource-default',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.destination).toBe('r2')
    expect(parsed.item.upload_id).toBe('abc')
  })

  it('parses Appwrite init response with optional jwt', () => {
    const parsed = v2UploadAppwriteInitResponseSchema.parse({
      item: {
        upload_id: 'abc',
        destination: 'appwrite',
        appwrite_endpoint: 'https://appwrite.example.com',
        appwrite_project_id: 'proj',
        appwrite_bucket_id: 'buck',
        file_id: 'file-1',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.jwt).toBeUndefined()
  })

  it('parses Appwrite init response with jwt populated', () => {
    const parsed = v2UploadAppwriteInitResponseSchema.parse({
      item: {
        upload_id: 'abc',
        destination: 'appwrite',
        appwrite_endpoint: 'https://appwrite.example.com',
        appwrite_project_id: 'proj',
        appwrite_bucket_id: 'buck',
        file_id: 'file-1',
        expires_at: 1234567890,
        jwt: 'jwt-token',
      },
    })
    expect(parsed.item.jwt).toBe('jwt-token')
  })

  it('parses lifecycle response with completed status + file_id', () => {
    const parsed = v2UploadLifecycleResponseSchema.parse({
      item: {
        id: 'upload-1',
        status: 'completed',
        upload_type: 'single',
        file_id: 'file-1',
      },
    })
    expect(parsed.item.status).toBe('completed')
    expect(parsed.item.file_id).toBe('file-1')
  })

  it('parses lifecycle response with failed status + null file_id', () => {
    const parsed = v2UploadLifecycleResponseSchema.parse({
      item: { id: 'upload-1', status: 'failed', upload_type: 'multipart', file_id: null },
    })
    expect(parsed.item.status).toBe('failed')
    expect(parsed.item.file_id).toBeNull()
  })

  it('parses multipart create response', () => {
    const parsed = v2MultipartCreateResponseSchema.parse({
      item: {
        upload_id: 'abc',
        r2_upload_id: 'r2-up-1',
        key: 'svc/2026/01/01/abc.bin',
        bucket: 'unisource-default',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.r2_upload_id).toBe('r2-up-1')
  })

  it('parses list-parts response with V2 envelope { items, page }', () => {
    const parsed = v2MultipartListPartsResponseSchema.parse({
      items: [{ PartNumber: 1, ETag: 'etag1', Size: 5242880 }],
      page: { limit: 1000, next_cursor: null },
    })
    expect(parsed.items[0].PartNumber).toBe(1)
    expect(parsed.page.next_cursor).toBeNull()
  })

  it('rejects sign-part query with part_number > 10000', () => {
    expect(() =>
      v2MultipartSignPartQuerySchema.parse({ upload_id: 'abc', part_number: 10001 })
    ).toThrow()
  })

  it('coerces sign-part part_number from string', () => {
    const parsed = v2MultipartSignPartQuerySchema.parse({ upload_id: 'abc', part_number: '5' })
    expect(parsed.part_number).toBe(5)
  })

  it('rejects multipart-complete with empty parts array', () => {
    expect(() =>
      v2MultipartCompleteRequestSchema.parse({ upload_id: 'abc', parts: [] })
    ).toThrow()
  })

  it('accepts multipart-complete with parts', () => {
    const parsed = v2MultipartCompleteRequestSchema.parse({
      upload_id: 'abc',
      parts: [{ PartNumber: 1, ETag: 'etag1' }],
    })
    expect(parsed.parts).toHaveLength(1)
  })
})
