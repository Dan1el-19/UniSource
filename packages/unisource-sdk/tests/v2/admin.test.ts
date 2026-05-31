import { describe, it, expect, vi, afterEach } from 'vitest'
import { UnisourceV2Client } from '../../src/v2/client'

const mockConfig = {
  baseUrl: 'https://api.example.com',
  serviceId: 'svc-1',
  getToken: () => 'test-token',
  silentBeta: true,
}

const validService = {
  id: 'svc-1',
  name: 'Test Service',
  max_storage_bytes: 1_000_000_000,
  current_used_bytes: 12_345,
  max_file_size_bytes: 100_000_000,
  recommended_upload_destination: 'r2' as const,
  created_at: 1700000000,
}

const validUser = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  status: true,
  labels: ['admin'],
  role: 'admin',
  has_service_access: true,
  max_storage_bytes: null,
  effective_max_storage_bytes: 1_000_000_000,
  current_used_bytes: 12_345,
  registration: 1700000000,
  email_verification: true,
}

const validAuditEvent = {
  id: 'aud-1',
  service_id: 'svc-1',
  user_id: 'user-1',
  action: 'upload_completed' as const,
  resource_type: 'file' as const,
  resource_id: 'file-1',
  metadata: { foo: 'bar' },
  ip_address: '127.0.0.1',
  created_at: 1700000000,
}

const validUsage = {
  service_id: 'svc-1',
  max_storage_bytes: 1_000_000_000,
  current_used_bytes: 12_345,
  used_percent: 0.01,
}

const validReconcile = {
  service_drift_bytes: 0,
  service_corrected: false,
  main_drift_bytes: 0,
  main_corrected: false,
  users_fixed: 0,
  dry_run: false,
}

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
}

function mockError(status: number, code: string, message: string, requestId = 'req-x') {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    headers: { get: () => requestId },
    json: () => Promise.resolve({ error: { code, message } }),
  })
}

// ─── getService ───────────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.getService', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls GET /v2/admin/service', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.getService()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/service',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.getService()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.getService()
    expect(result.service.id).toBe('svc-1')
    expect(result.service.max_storage_bytes).toBe(1_000_000_000)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'Service not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.getService()).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found', requestId: 'req-404',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.getService(controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── updateService ────────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.updateService', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls PATCH /v2/admin/service', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateService({ max_storage_bytes: 2_000_000_000, max_file_size_bytes: 200_000_000 })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/service',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateService({ max_storage_bytes: 2_000_000_000, max_file_size_bytes: 200_000_000 })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends body fields', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateService({ max_storage_bytes: 5_000_000_000, max_file_size_bytes: 500_000_000 })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ max_storage_bytes: 5_000_000_000, max_file_size_bytes: 500_000_000 })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.updateService({ max_storage_bytes: 1, max_file_size_bytes: 1 })
    expect(result.service.id).toBe('svc-1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'Service not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.updateService({ max_storage_bytes: 1, max_file_size_bytes: 1 })).rejects.toMatchObject({
      name: 'UnisourceV2Error', status: 404, code: 'not_found',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.updateService({ max_storage_bytes: 1, max_file_size_bytes: 1 }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── updateServiceSettings ────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.updateServiceSettings', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls PATCH /v2/admin/service/settings', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateServiceSettings({ recommended_upload_destination: 'r2' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/service/settings',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('sends body fields', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateServiceSettings({ recommended_upload_destination: 'appwrite' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ recommended_upload_destination: 'appwrite' })
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateServiceSettings({ recommended_upload_destination: 'hybrid' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.updateServiceSettings({ recommended_upload_destination: 'r2' })
    expect(result.service.id).toBe('svc-1')
  })

  it('throws UnisourceV2Error on 400', async () => {
    vi.stubGlobal('fetch', mockError(400, 'validation_error', 'Bad request', 'req-400'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(
      client.admin.updateServiceSettings({ recommended_upload_destination: 'r2' })
    ).rejects.toMatchObject({ name: 'UnisourceV2Error', status: 400 })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ service: validService }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.updateServiceSettings({ recommended_upload_destination: 'r2' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── getServiceUsage ──────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.getServiceUsage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls GET /v2/admin/service/usage', async () => {
    vi.stubGlobal('fetch', mockOk(validUsage))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.getServiceUsage()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/service/usage',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('sets X-Service-ID and Authorization headers', async () => {
    vi.stubGlobal('fetch', mockOk(validUsage))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.getServiceUsage()
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['X-Service-ID']).toBe('svc-1')
    expect(headers['Authorization']).toBe('Bearer test-token')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk(validUsage))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.getServiceUsage()
    expect(result.service_id).toBe('svc-1')
    expect(result.used_percent).toBe(0.01)
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'Service not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.getServiceUsage()).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(validUsage))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.getServiceUsage(controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── listAuditLog ─────────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.listAuditLog', () => {
  afterEach(() => vi.unstubAllGlobals())

  function okBody(items = [validAuditEvent]) {
    return { items, next_cursor: null, limit: 25 }
  }

  it('calls GET /v2/admin/audit-log without query', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.listAuditLog()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/audit-log',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('appends query params when provided', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.listAuditLog({
      user_id: 'user-1',
      action: 'upload_completed',
      resource_type: 'file',
      cursor: 'abc',
      limit: 50,
    })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('user_id')).toBe('user-1')
    expect(url.searchParams.get('action')).toBe('upload_completed')
    expect(url.searchParams.get('resource_type')).toBe('file')
    expect(url.searchParams.get('cursor')).toBe('abc')
    expect(url.searchParams.get('limit')).toBe('50')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.listAuditLog()
    expect(result.items[0]!.id).toBe('aud-1')
    expect(result.next_cursor).toBeNull()
    expect(result.limit).toBe(25)
  })

  it('throws UnisourceV2Error on 400 invalid cursor', async () => {
    vi.stubGlobal('fetch', mockError(400, 'cursor_invalid', 'cursor is invalid', 'req-400'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.listAuditLog({ cursor: 'bad' })).rejects.toMatchObject({
      status: 400, code: 'cursor_invalid',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.listAuditLog(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── listUsers ────────────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.listUsers', () => {
  afterEach(() => vi.unstubAllGlobals())

  function okBody(items = [validUser]) {
    return { items, total: items.length, offset: 0, limit: 25 }
  }

  it('calls GET /v2/admin/users without query', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.listUsers()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('appends query params when provided (search, offset, limit)', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.listUsers({ search: 'alice', offset: 50, limit: 25 })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('search')).toBe('alice')
    expect(url.searchParams.get('offset')).toBe('50')
    expect(url.searchParams.get('limit')).toBe('25')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.listUsers()
    expect(result.items[0]!.id).toBe('user-1')
    expect(result.total).toBe(1)
    expect(result.offset).toBe(0)
    expect(result.limit).toBe(25)
  })

  it('throws UnisourceV2Error on 500', async () => {
    vi.stubGlobal('fetch', mockError(500, 'internal_error', 'oops', 'req-500'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.listUsers()).rejects.toMatchObject({ status: 500 })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(okBody()))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.listUsers(undefined, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.updateUser', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls PATCH /v2/admin/users/:userId', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUser('user-1', { name: 'New' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user-1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes userId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUser('user:with space', { name: 'x' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user%3Awith%20space',
      expect.anything()
    )
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUser('user-1', { name: 'x' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sends partial body (name only)', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUser('user-1', { name: 'New Name' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'New Name' })
  })

  it('sends full body with all fields', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUser('user-1', {
      name: 'A',
      email: 'a@b.c',
      status: false,
      labels: ['x', 'y'],
      role: 'plus',
      max_storage_bytes: 9999,
    })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({
      name: 'A',
      email: 'a@b.c',
      status: false,
      labels: ['x', 'y'],
      role: 'plus',
      max_storage_bytes: 9999,
    })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.updateUser('user-1', { name: 'x' })
    expect(result.user.id).toBe('user-1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'User not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.updateUser('missing', { name: 'x' })).rejects.toMatchObject({
      status: 404, code: 'not_found',
    })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.updateUser('user-1', { name: 'x' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── resetUserPassword ────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.resetUserPassword', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls POST /v2/admin/users/:userId/password', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.resetUserPassword('user-1', { password: 'newSecret123' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user-1/password',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('URL-encodes userId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.resetUserPassword('user:with space', { password: 'newSecret123' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user%3Awith%20space/password',
      expect.anything()
    )
  })

  it('sends password body', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.resetUserPassword('user-1', { password: 'mySuperSecret' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ password: 'mySuperSecret' })
  })

  it('sets Content-Type: application/json', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.resetUserPassword('user-1', { password: 'newSecret123' })
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.resetUserPassword('user-1', { password: 'newSecret123' })
    expect(result).toEqual({ success: true, user_id: 'user-1' })
  })

  it('throws UnisourceV2Error on 400', async () => {
    vi.stubGlobal('fetch', mockError(400, 'validation_error', 'Password too short', 'req-400'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(
      client.admin.resetUserPassword('user-1', { password: 'short' })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ success: true, user_id: 'user-1' }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.resetUserPassword('user-1', { password: 'newSecret123' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── updateUserRole ───────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.updateUserRole', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls PATCH /v2/admin/users/:userId/role', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserRole('user-1', { role: 'admin' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user-1/role',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes userId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserRole('user:with space', { role: 'plus' })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user%3Awith%20space/role',
      expect.anything()
    )
  })

  it('sends role body', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserRole('user-1', { role: 'plus' })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ role: 'plus' })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.updateUserRole('user-1', { role: 'admin' })
    expect(result.user.id).toBe('user-1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'User not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(
      client.admin.updateUserRole('missing', { role: 'user' })
    ).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.updateUserRole('user-1', { role: 'user' }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── updateUserStorageLimit ───────────────────────────────────────────────────

describe('UnisourceV2Client.admin.updateUserStorageLimit', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls PATCH /v2/admin/users/:userId/storage-limit', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserStorageLimit('user-1', { limit_bytes: 9999 })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user-1/storage-limit',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('URL-encodes userId with special characters', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserStorageLimit('user:with space', { limit_bytes: 9999 })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/users/user%3Awith%20space/storage-limit',
      expect.anything()
    )
  })

  it('sends limit_bytes body (positive number)', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserStorageLimit('user-1', { limit_bytes: 5_000_000 })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ limit_bytes: 5_000_000 })
  })

  it('sends limit_bytes body (null reset)', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.updateUserStorageLimit('user-1', { limit_bytes: null })
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ limit_bytes: null })
  })

  it('parses response', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.updateUserStorageLimit('user-1', { limit_bytes: null })
    expect(result.user.id).toBe('user-1')
  })

  it('throws UnisourceV2Error on 404', async () => {
    vi.stubGlobal('fetch', mockError(404, 'not_found', 'User not found', 'req-404'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(
      client.admin.updateUserStorageLimit('missing', { limit_bytes: 1 })
    ).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk({ user: validUser }))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.updateUserStorageLimit('user-1', { limit_bytes: 1 }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})

// ─── reconcileQuota ───────────────────────────────────────────────────────────

describe('UnisourceV2Client.admin.reconcileQuota', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls POST /v2/admin/quota/reconcile without query', async () => {
    vi.stubGlobal('fetch', mockOk(validReconcile))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.reconcileQuota()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.example.com/v2/admin/quota/reconcile',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does not append dry_run when omitted', async () => {
    vi.stubGlobal('fetch', mockOk(validReconcile))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.reconcileQuota()
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.has('dry_run')).toBe(false)
  })

  it('transforms dryRun: true → dry_run=true', async () => {
    vi.stubGlobal('fetch', mockOk(validReconcile))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.reconcileQuota({ dryRun: true })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('dry_run')).toBe('true')
  })

  it('transforms dryRun: false → dry_run=false', async () => {
    vi.stubGlobal('fetch', mockOk(validReconcile))
    const client = new UnisourceV2Client(mockConfig)
    await client.admin.reconcileQuota({ dryRun: false })
    const url = new URL(vi.mocked(fetch).mock.calls[0]![0] as string)
    expect(url.searchParams.get('dry_run')).toBe('false')
  })

  it('parses response with full reconcile shape', async () => {
    vi.stubGlobal('fetch', mockOk({
      service_drift_bytes: 100,
      service_corrected: true,
      main_drift_bytes: -50,
      main_corrected: true,
      users_fixed: 3,
      dry_run: false,
    }))
    const client = new UnisourceV2Client(mockConfig)
    const result = await client.admin.reconcileQuota({ dryRun: false })
    expect(result).toEqual({
      service_drift_bytes: 100,
      service_corrected: true,
      main_drift_bytes: -50,
      main_corrected: true,
      users_fixed: 3,
      dry_run: false,
    })
  })

  it('throws UnisourceV2Error on 500', async () => {
    vi.stubGlobal('fetch', mockError(500, 'internal_error', 'Reconcile failed', 'req-500'))
    const client = new UnisourceV2Client(mockConfig)
    await expect(client.admin.reconcileQuota()).rejects.toMatchObject({ status: 500 })
  })

  it('forwards AbortSignal to fetch', async () => {
    vi.stubGlobal('fetch', mockOk(validReconcile))
    const client = new UnisourceV2Client(mockConfig)
    const controller = new AbortController()
    await client.admin.reconcileQuota({ dryRun: true }, controller.signal)
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal)
  })
})
