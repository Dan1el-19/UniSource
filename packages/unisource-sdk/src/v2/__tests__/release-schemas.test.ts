import { describe, it, expect } from 'vitest'
import {
  v2ReleaseSchema,
  v2ReleaseListResponseSchema,
  v2ReleaseUploadInitResponseSchema,
  v2ReleaseLifecycleResponseSchema,
  v2ReleaseMultipartCreateResponseSchema,
  v2ReleaseMultipartListPartsResponseSchema,
  v2ReleaseSyncResponseSchema,
} from '../release-schemas'

const release = {
  id: 'rel-1',
  service_id: 'svc-1',
  name: 'v1.2.3',
  size: 4096,
  r2_key: 'releases/svc-1/app.zip',
  tags: ['stable'],
  notes: null,
  force_update: false,
  uploaded_by: 'system',
  upload_status: 'completed' as const,
  created_at: '2026-05-29T00:00:00.000Z',
}

describe('v2 release schemas', () => {
  it('parses a release item', () => {
    expect(v2ReleaseSchema.parse(release).id).toBe('rel-1')
  })

  it('parses list response with V2 page envelope', () => {
    const parsed = v2ReleaseListResponseSchema.parse({
      items: [release],
      page: { limit: 25, next_cursor: null },
    })
    expect(parsed.items).toHaveLength(1)
    expect(parsed.page.limit).toBe(25)
  })

  it('parses single upload init response with item envelope', () => {
    const parsed = v2ReleaseUploadInitResponseSchema.parse({
      item: {
        release_id: 'rel-1',
        presigned_url: 'https://r2.example.com/put',
        r2_key: 'releases/svc-1/app.zip',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.release_id).toBe('rel-1')
  })

  it('parses release lifecycle response', () => {
    const parsed = v2ReleaseLifecycleResponseSchema.parse({
      item: { id: 'rel-1', status: 'completed' },
    })
    expect(parsed.item.status).toBe('completed')
  })

  it('parses multipart create response', () => {
    const parsed = v2ReleaseMultipartCreateResponseSchema.parse({
      item: {
        upload_id: 'rel-1',
        r2_upload_id: 'r2-up-1',
        key: 'releases/svc-1/app.zip',
        bucket: 'primary',
        expires_at: 1234567890,
      },
    })
    expect(parsed.item.r2_upload_id).toBe('r2-up-1')
  })

  it('parses multipart list-parts V2 envelope', () => {
    const parsed = v2ReleaseMultipartListPartsResponseSchema.parse({
      items: [{ PartNumber: 1, ETag: 'etag-1', Size: 5242880 }],
      page: { limit: 1000, next_cursor: null },
    })
    expect(parsed.items[0].PartNumber).toBe(1)
  })

  it('parses sync bulk-style response', () => {
    const parsed = v2ReleaseSyncResponseSchema.parse({
      processed: ['rel-1'],
      failed: [{ id: 'bad-key', code: 'validation_error', message: 'r2_key must start with releases/svc-1/' }],
    })
    expect(parsed.processed).toEqual(['rel-1'])
    expect(parsed.failed[0].code).toBe('validation_error')
  })
})
