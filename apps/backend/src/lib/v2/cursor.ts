import { V2Error } from './errors'
import type { SortBy, SortDir } from './pagination'

export interface CursorPayload {
  v: 1
  sb: SortBy
  sd: SortDir
  lv: string | number
  li: string
  fp: string
}

export interface FilterSet {
  user_id: string
  service_id: string
  folder_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search: string | undefined
  mime_type: string | undefined
}

let cachedKey: CryptoKey | null = null
let cachedSecret: string | null = null

function fnv1a32(s: string): number {
  let h = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // FNV prime
  }
  return h >>> 0
}

function toBase64Url(buf: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...buf))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/')
  const b64 = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const bin = atob(b64)
  return new Uint8Array(bin.length)
    .map((_, i) => bin.charCodeAt(i))
}

async function getKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) {
    throw new Error('CURSOR_HMAC_SECRET must be at least 32 chars long')
  }

  if (cachedKey && cachedSecret === secret) {
    return cachedKey
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )

  cachedKey = key
  cachedSecret = secret
  return key
}

export function fingerprint(input: FilterSet): string {
  const canonical = [
    input.user_id,
    input.service_id,
    input.folder_id === undefined ? '*' : input.folder_id ?? '__root__',
    input.trash,
    input.search ?? '',
    input.mime_type ?? '',
  ].join('|')
  return fnv1a32(canonical).toString(16)
}

export async function encodeCursor(secret: string, payload: CursorPayload): Promise<string> {
  const key = await getKey(secret)
  const body = JSON.stringify(payload)
  const bodyBytes = new TextEncoder().encode(body)
  const bodyB64 = toBase64Url(bodyBytes)

  const sig = await crypto.subtle.sign('HMAC', key, bodyBytes)
  const sigB64 = toBase64Url(new Uint8Array(sig))

  return `${bodyB64}.${sigB64}`
}

export async function decodeCursor(
  secret: string,
  encoded: string,
  expected: { sb: SortBy; sd: SortDir; fp: string }
): Promise<CursorPayload> {
  try {
    const parts = encoded.split('.')
    if (parts.length !== 2) {
      throw new V2Error('cursor_invalid', 400)
    }

    const [bodyB64, sigB64] = parts
    const bodyBytes = fromBase64Url(bodyB64)
    const sigBytes = fromBase64Url(sigB64)

    const payload: CursorPayload = JSON.parse(new TextDecoder().decode(bodyBytes))

    if (payload.v !== 1) {
      throw new V2Error('cursor_invalid', 400)
    }

    if (payload.sb !== expected.sb || payload.sd !== expected.sd || payload.fp !== expected.fp) {
      throw new V2Error('cursor_invalid', 400)
    }

    const key = await getKey(secret)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes)

    if (!valid) {
      throw new V2Error('cursor_invalid', 400)
    }

    return payload
  } catch (err) {
    if (err instanceof V2Error) {
      throw err
    }
    throw new V2Error('cursor_invalid', 400)
  }
}
