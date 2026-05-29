import { describe, expect, it } from 'vitest'
import {
  v2FolderDeleteResponseSchema,
  v2FolderDetailResponseSchema,
} from '../folders'
import {
  v2MyFilesListResponseSchema,
  v2MyFilesMoveResponseSchema,
} from '../my-files-schemas'

const folder = {
  id: 'folder-1',
  service_id: 'default',
  user_id: 'user-1',
  parent_id: null,
  name: 'Docs',
  color_tag: null,
  is_trashed: false,
  trashed_at: null,
  created_at: 1,
  updated_at: 2,
}

const file = {
  id: 'file-1',
  service_id: 'default',
  user_id: 'user-1',
  folder_id: null,
  upload_id: null,
  filename: 'a.txt',
  size: 0,
  mime_type: 'text/plain',
  storage_destination: 'r2' as const,
  is_trashed: false,
  trashed_at: null,
  created_at: 1,
  updated_at: 2,
}

describe('v2 shared route schemas', () => {
  it('parses shared folder details with { item } envelope', () => {
    const parsing = v2FolderDetailResponseSchema.safeParse({ item: folder })
    expect(parsing.success).toBe(true)
    if (parsing.success) {
      expect('item' in parsing.data || 'folder' in parsing.data).toBe(true)
    }
  })

  it('parses shared folder actions with { item } envelope', () => {
    const parsing = v2FolderDeleteResponseSchema.safeParse({
      item: { success: true, id: 'folder-1', permanent: false },
    })
    expect(parsing.success).toBe(true)
  })

  it('parses shared my-files lists with { items, page } envelope', () => {
    const parsing = v2MyFilesListResponseSchema.safeParse({
      items: [file],
      page: { limit: 25, next_cursor: null },
    })
    expect(parsing.success).toBe(true)
  })

  it('parses shared my-files actions with { item } envelope', () => {
    const parsing = v2MyFilesMoveResponseSchema.safeParse({
      item: { success: true, id: 'file-1', folder_id: null },
    })
    expect(parsing.success).toBe(true)
  })
})
