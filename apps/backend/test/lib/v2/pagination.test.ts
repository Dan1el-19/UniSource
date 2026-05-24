import { describe, it, expect } from 'vitest'
import {
  buildBaseWhere,
  buildKeysetWhere,
  escapeLikePattern,
  type SortBy,
  type SortDir,
} from '../../../src/lib/v2/pagination'

describe('pagination', () => {
  describe('escapeLikePattern', () => {
    it('escapes backslash first', () => {
      expect(escapeLikePattern('foo\\bar')).toBe('foo\\\\bar')
    })

    it('escapes percent wildcard', () => {
      expect(escapeLikePattern('foo%bar')).toBe('foo\\%bar')
    })

    it('escapes underscore wildcard', () => {
      expect(escapeLikePattern('foo_bar')).toBe('foo\\_bar')
    })

    it('escapes backslash then percent', () => {
      expect(escapeLikePattern('100\\%done')).toBe('100\\\\\\%done')
    })

    it('escapes all three in sequence', () => {
      expect(escapeLikePattern('a\\b%c_d')).toBe('a\\\\b\\%c\\_d')
    })

    it('handles empty string', () => {
      expect(escapeLikePattern('')).toBe('')
    })
  })

  describe('buildBaseWhere', () => {
    it('always starts with is_main_storage = 0', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
      })
      expect(result.sql).toMatch(/^is_main_storage = 0/)
    })

    it('includes user_id and service_id', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
      })
      expect(result.sql).toContain('user_id = ?')
      expect(result.sql).toContain('service_id = ?')
      expect(result.binds).toContain('user1')
      expect(result.binds).toContain('svc1')
    })

    it('includes trash filter for active', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
      })
      expect(result.sql).toContain('is_trashed = 0')
    })

    it('includes trash filter for trashed', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'trashed',
      })
      expect(result.sql).toContain('is_trashed = 1')
    })

    it('omits trash filter for all', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'all',
      })
      expect(result.sql).not.toContain('is_trashed')
    })

    it('handles folder_id undefined (skips condition)', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: undefined,
        trash: 'active',
      })
      expect(result.sql).not.toContain('folder_id')
    })

    it('handles folder_id null (IS NULL)', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: null,
        trash: 'active',
      })
      expect(result.sql).toContain('folder_id IS NULL')
    })

    it('handles folder_id string (= ?)', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
      })
      expect(result.sql).toContain('folder_id = ?')
      expect(result.binds).toContain('folder1')
    })

    it('includes search filter with LIKE and ESCAPE', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: 'test',
      })
      expect(result.sql).toContain('filename LIKE ?')
      expect(result.sql).toContain("ESCAPE '\\\\'")
      expect(result.binds).toContain('%test%')
    })

    it('includes mime_type filter', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        mime_type: 'image/png',
      })
      expect(result.sql).toContain('mime_type = ?')
      expect(result.binds).toContain('image/png')
    })

    it('uses positional parameters (no raw concat)', () => {
      const result = buildBaseWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        search: 'test%file',
        mime_type: 'image/png',
      })
      const placeholderCount = (result.sql.match(/\?/g) || []).length
      expect(placeholderCount).toBe(result.binds.length)
      expect(result.sql).not.toContain("'user1'")
      expect(result.sql).not.toContain("'svc1'")
    })
  })

  describe('buildKeysetWhere', () => {
    it('throws when sort_by is unknown', () => {
      expect(() =>
        buildKeysetWhere({
          user_id: 'user1',
          service_id: 'svc1',
          folder_id: 'folder1',
          trash: 'active',
          sort_by: 'unknown_field' as SortBy,
          sort_dir: 'asc',
        })
      ).toThrow()
    })

    it('uses < operator for desc direction', () => {
      const result = buildKeysetWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        sort_by: 'created_at',
        sort_dir: 'desc',
        cursor_lv: '2026-05-24',
        cursor_li: 'id123',
      })
      expect(result.sql).toContain('created_at < ?')
      expect(result.sql).toContain('id < ?')
    })

    it('uses > operator for asc direction', () => {
      const result = buildKeysetWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        sort_by: 'created_at',
        sort_dir: 'asc',
        cursor_lv: '2026-05-24',
        cursor_li: 'id123',
      })
      expect(result.sql).toContain('created_at > ?')
      expect(result.sql).toContain('id > ?')
    })

    it('includes orderBy with sort column and direction', () => {
      const result = buildKeysetWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        sort_by: 'name',
        sort_dir: 'asc',
      })
      expect(result.orderBy).toContain('filename')
      expect(result.orderBy).toContain('asc')
      expect(result.orderBy).toContain('id')
    })

    it('maps sort_by to correct column', () => {
      const cases: Array<{ sb: SortBy; col: string }> = [
        { sb: 'created_at', col: 'created_at' },
        { sb: 'updated_at', col: 'updated_at' },
        { sb: 'name', col: 'filename' },
        { sb: 'size', col: 'size' },
      ]

      cases.forEach(({ sb, col }) => {
        const result = buildKeysetWhere({
          user_id: 'user1',
          service_id: 'svc1',
          folder_id: 'folder1',
          trash: 'active',
          sort_by: sb,
          sort_dir: 'asc',
        })
        expect(result.orderBy).toContain(col)
      })
    })

    it('includes base WHERE conditions', () => {
      const result = buildKeysetWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        sort_by: 'created_at',
        sort_dir: 'asc',
      })
      expect(result.sql).toContain('is_main_storage = 0')
      expect(result.sql).toContain('user_id = ?')
      expect(result.sql).toContain('service_id = ?')
    })

    it('binds cursor values when provided', () => {
      const result = buildKeysetWhere({
        user_id: 'user1',
        service_id: 'svc1',
        folder_id: 'folder1',
        trash: 'active',
        sort_by: 'created_at',
        sort_dir: 'asc',
        cursor_lv: '2026-05-24',
        cursor_li: 'id123',
      })
      expect(result.binds).toContain('2026-05-24')
      expect(result.binds).toContain('id123')
    })
  })
})
