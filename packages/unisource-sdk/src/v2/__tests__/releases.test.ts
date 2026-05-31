import { describe, it, expect, vi } from 'vitest'
import { createReleasesResource } from '../resources/releases'
import type { V2Request } from '../transport'

function fakeRequest(): { call: ReturnType<typeof vi.fn>; request: V2Request } {
  const call = vi.fn()
  const request: V2Request = ((method, path, options) => {
    call(method, path, options)
    return Promise.resolve(undefined) as never
  }) as V2Request
  return { call, request }
}

describe('releases resource', () => {
  it('uploadInit posts to /v2/releases/upload/init', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).uploadInit({ name: 'v1', filename: 'app.zip' }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/v2/releases/upload/init', expect.objectContaining({ body: expect.objectContaining({ name: 'v1' }) }))
  })

  it('multipartSignPart issues GET with upload_id and part_number', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).multipartSignPart('rel-1', 3).catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/v2/releases/upload/multipart/sign-part', expect.objectContaining({ query: { upload_id: 'rel-1', part_number: 3 } }))
  })

  it('list issues GET /v2/releases', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).list({ limit: 10 }).catch(() => {})
    expect(call).toHaveBeenCalledWith('GET', '/v2/releases', expect.objectContaining({ query: { limit: 10 } }))
  })

  it('delete issues DELETE /v2/releases/:id', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).delete('rel 1').catch(() => {})
    expect(call).toHaveBeenCalledWith('DELETE', '/v2/releases/rel%201', expect.any(Object))
  })

  it('sync posts to /v2/releases/sync', async () => {
    const { call, request } = fakeRequest()
    await createReleasesResource(request).sync({ releases: [{ name: 'v1', r2_key: 'releases/svc/app.zip', size: 1 }] }).catch(() => {})
    expect(call).toHaveBeenCalledWith('POST', '/v2/releases/sync', expect.any(Object))
  })
})
