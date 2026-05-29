import { describe, it, expect, vi } from 'vitest'
import { createUploadResource } from '../resources/upload'
import type { V2Request } from '../transport'

function fakeRequest(): { call: ReturnType<typeof vi.fn>; request: V2Request } {
  const call = vi.fn()
  const request: V2Request = ((method, path, options) => {
    call(method, path, options)
    return Promise.resolve(undefined) as never
  }) as V2Request
  return { call, request }
}

describe('upload resource', () => {
  it('r2Init posts to /upload/r2/init', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource
      .r2Init({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' })
      .catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'POST',
      '/upload/r2/init',
      expect.objectContaining({
        body: expect.objectContaining({
          filename: 'a.bin',
          size: 1024,
          mime_type: 'application/octet-stream',
        }),
      })
    )
  })

  it('appwriteInit posts to /upload/appwrite/init', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource
      .appwriteInit({ filename: 'a.bin', size: 1024, mime_type: 'application/octet-stream' })
      .catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/appwrite/init', expect.any(Object))
  })

  it('complete posts to /upload/complete with upload_id in body', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.complete('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'POST',
      '/upload/complete',
      expect.objectContaining({
        body: expect.objectContaining({ upload_id: 'upload-1' }),
      })
    )
  })

  it('multipartCreate posts to /upload/r2/multipart/create', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource
      .multipartCreate({
        filename: 'big.bin',
        size: 5_000_000,
        mime_type: 'application/octet-stream',
      })
      .catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/upload/r2/multipart/create', expect.any(Object))
  })

  it('multipartSignPart issues GET with upload_id + part_number in query', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartSignPart('upload-1', 5).catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'GET',
      '/upload/r2/multipart/sign-part',
      expect.objectContaining({
        query: { upload_id: 'upload-1', part_number: 5 },
      })
    )
  })

  it('multipartListParts issues GET with upload_id in query', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartListParts('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'GET',
      '/upload/r2/multipart/list-parts',
      expect.objectContaining({
        query: { upload_id: 'upload-1' },
      })
    )
  })

  it('multipartComplete posts to /upload/r2/multipart/complete with parts', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource
      .multipartComplete('upload-1', [{ PartNumber: 1, ETag: 'etag1' }])
      .catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'POST',
      '/upload/r2/multipart/complete',
      expect.objectContaining({
        body: { upload_id: 'upload-1', parts: [{ PartNumber: 1, ETag: 'etag1' }] },
      })
    )
  })

  it('multipartAbort issues DELETE with upload_id in body', async () => {
    const { call, request } = fakeRequest()
    const resource = createUploadResource(request)
    await resource.multipartAbort('upload-1').catch(() => {})
    expect(call).toHaveBeenCalledWith(
      'DELETE',
      '/upload/r2/multipart/abort',
      expect.objectContaining({
        body: { upload_id: 'upload-1' },
      })
    )
  })
})
