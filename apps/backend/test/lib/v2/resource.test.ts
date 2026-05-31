import { describe, it, expect } from 'vitest'
import {
  RESOURCE_CONFIG_FILES,
  RESOURCE_CONFIG_FOLDERS,
} from '../../../src/lib/v2/resource'

describe('resource configs', () => {
  describe('RESOURCE_CONFIG_FILES', () => {
    it('targets the files table', () => {
      expect(RESOURCE_CONFIG_FILES.table).toBe('files')
    })

    it('starts baseConditions with is_main_storage = 0', () => {
      expect(RESOURCE_CONFIG_FILES.baseConditions).toEqual(['is_main_storage = 0'])
    })

    it('maps name sort to filename column', () => {
      expect(RESOURCE_CONFIG_FILES.sortColumns.name).toBe('filename')
    })

    it('declares user_id, service_id, folder_id, search, mime_type as filters', () => {
      const keys = RESOURCE_CONFIG_FILES.filters.map((f) => f.key)
      expect(keys).toEqual(['user_id', 'service_id', 'folder_id', 'search', 'mime_type'])
    })

    it('lists fingerprintKeys in deterministic order', () => {
      expect(RESOURCE_CONFIG_FILES.fingerprintKeys).toEqual([
        'user_id', 'service_id', 'folder_id', 'trash', 'search', 'mime_type',
      ])
    })
  })

  describe('RESOURCE_CONFIG_FOLDERS', () => {
    it('targets the folders table', () => {
      expect(RESOURCE_CONFIG_FOLDERS.table).toBe('folders')
    })

    it('has empty baseConditions (no is_main_storage column)', () => {
      expect(RESOURCE_CONFIG_FOLDERS.baseConditions).toEqual([])
    })

    it('maps name sort to name column (not filename)', () => {
      expect(RESOURCE_CONFIG_FOLDERS.sortColumns.name).toBe('name')
    })

    it('uses parent_id, not folder_id', () => {
      const keys = RESOURCE_CONFIG_FOLDERS.filters.map((f) => f.key)
      expect(keys).toContain('parent_id')
      expect(keys).not.toContain('folder_id')
      expect(keys).not.toContain('mime_type')
    })

    it('does not include size in sortColumns', () => {
      expect(RESOURCE_CONFIG_FOLDERS.sortColumns).not.toHaveProperty('size')
    })

    it('search filter targets name column', () => {
      const search = RESOURCE_CONFIG_FOLDERS.filters.find((f) => f.key === 'search')
      expect(search?.column).toBe('name')
      expect(search?.op).toBe('LIKE_ESCAPED')
    })
  })
})
