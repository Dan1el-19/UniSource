import { describe, it, expect, beforeEach } from 'vitest'
import {
  encodeCursor,
  decodeCursor,
  fingerprint,
  type CursorPayload,
  type FilterSet,
} from '../../../src/lib/v2/cursor'
import { V2Error } from '../../../src/lib/v2/errors'

const SECRET = 'a'.repeat(32) // 32-char secret for testing

describe('cursor', () => {
  describe('fingerprint', () => {
    it('is deterministic for identical input', () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: 'test',
        mime_type: 'image/png',
      }
      const fp1 = fingerprint(filter)
      const fp2 = fingerprint(filter)
      expect(fp1).toBe(fp2)
    })

    it('differs when user_id changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, user_id: 'user2' })
      expect(fp1).not.toBe(fp2)
    })

    it('differs when service_id changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, service_id: 'svc2' })
      expect(fp1).not.toBe(fp2)
    })

    it('differs when folder_id changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, folder_id: 'folder2' })
      expect(fp1).not.toBe(fp2)
    })

    it('differs when trash changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, trash: 'trashed' })
      expect(fp1).not.toBe(fp2)
    })

    it('differs when search changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: 'test1',
        mime_type: undefined,
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, search: 'test2' })
      expect(fp1).not.toBe(fp2)
    })

    it('differs when mime_type changes', () => {
      const base: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: 'image/png',
      }
      const fp1 = fingerprint(base)
      const fp2 = fingerprint({ ...base, mime_type: 'image/jpeg' })
      expect(fp1).not.toBe(fp2)
    })

    it('handles undefined folder_id as *', () => {
      const filter1: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: undefined,
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const filter2: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: undefined,
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      expect(fingerprint(filter1)).toBe(fingerprint(filter2))
    })

    it('handles null folder_id as __root__', () => {
      const filter1: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: null,
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const filter2: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: null,
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      expect(fingerprint(filter1)).toBe(fingerprint(filter2))
    })
  })

  describe('encode/decode round-trip', () => {
    const sortCombos: Array<{ sb: 'created_at' | 'updated_at' | 'name' | 'size'; sd: 'asc' | 'desc' }> = [
      { sb: 'created_at', sd: 'asc' },
      { sb: 'created_at', sd: 'desc' },
      { sb: 'updated_at', sd: 'asc' },
      { sb: 'updated_at', sd: 'desc' },
      { sb: 'name', sd: 'asc' },
      { sb: 'name', sd: 'desc' },
      { sb: 'size', sd: 'asc' },
      { sb: 'size', sd: 'desc' },
    ]

    sortCombos.forEach(({ sb, sd }) => {
      it(`round-trip for sort_by=${sb}, sort_dir=${sd}`, async () => {
        const filter: FilterSet = {
          user_id: 'user1',
          service_id: 'svc1',
          folder_id: 'folder1',
          trash: 'active',
          search: undefined,
          mime_type: undefined,
        }
        const fp = fingerprint(filter)

        const payload: CursorPayload = {
          v: 1,
          sb,
          sd,
          lv: 'last_value_123',
          li: 'last_id_456',
          fp,
        }

        const encoded = await encodeCursor(SECRET, payload)
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) // base64url.base64url

        const decoded = await decodeCursor(SECRET, encoded, { sb, sd, fp })
        expect(decoded).toEqual(payload)
      })
    })
  })

  describe('decodeCursor validation', () => {
    it('throws cursor_invalid when encoded has no dot separator', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      await expect(
        decodeCursor(SECRET, 'nodothere', { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, 'nodothere', { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect(e).toBeInstanceOf(V2Error)
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when base64 is malformed', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      await expect(
        decodeCursor(SECRET, '!!!.!!!', { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, '!!!.!!!', { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when JSON is malformed', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      // Create a valid base64url string that's not valid JSON
      const badJson = Buffer.from('not json').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const badSig = Buffer.from('sig').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      await expect(
        decodeCursor(SECRET, `${badJson}.${badSig}`, { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, `${badJson}.${badSig}`, { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when HMAC signature does not match', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)
      const [body, sig] = encoded.split('.')

      // Tamper with signature
      const tamperedSig = Buffer.from('tampered').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const tampered = `${body}.${tamperedSig}`

      await expect(
        decodeCursor(SECRET, tampered, { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, tampered, { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when version is not 1', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)

      // Manually create a cursor with v: 2 by modifying the encoded string
      const [body] = encoded.split('.')
      const bodyBytes = Buffer.from(body, 'base64')
      const bodyObj = JSON.parse(bodyBytes.toString())
      bodyObj.v = 2
      const modifiedBody = Buffer.from(JSON.stringify(bodyObj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      const modifiedEncoded = `${modifiedBody}.invalidsig`

      await expect(
        decodeCursor(SECRET, modifiedEncoded, { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, modifiedEncoded, { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when sort_by does not match expected', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)

      await expect(
        decodeCursor(SECRET, encoded, { sb: 'updated_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, encoded, { sb: 'updated_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when sort_dir does not match expected', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)

      await expect(
        decodeCursor(SECRET, encoded, { sb: 'created_at', sd: 'desc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, encoded, { sb: 'created_at', sd: 'desc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when fingerprint does not match expected', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)

      await expect(
        decodeCursor(SECRET, encoded, { sb: 'created_at', sd: 'asc', fp: 'different_fp' })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(SECRET, encoded, { sb: 'created_at', sd: 'asc', fp: 'different_fp' })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })

    it('throws cursor_invalid when decoded with different secret', async () => {
      const filter: FilterSet = {
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: undefined,
        mime_type: undefined,
      }
      const fp = fingerprint(filter)

      const payload: CursorPayload = {
        v: 1,
        sb: 'created_at',
        sd: 'asc',
        lv: 'last_value_123',
        li: 'last_id_456',
        fp,
      }

      const encoded = await encodeCursor(SECRET, payload)
      const differentSecret = 'b'.repeat(32)

      await expect(
        decodeCursor(differentSecret, encoded, { sb: 'created_at', sd: 'asc', fp })
      ).rejects.toThrow(V2Error)
      try {
        await decodeCursor(differentSecret, encoded, { sb: 'created_at', sd: 'asc', fp })
      } catch (e) {
        expect((e as V2Error).code).toBe('cursor_invalid')
      }
    })
  })
})
