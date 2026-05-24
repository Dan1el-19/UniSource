export type FilterOp = '=' | 'IS_NULL_OR_EQ' | 'LIKE_ESCAPED'

export interface FilterDescriptor<F> {
  key: keyof F & string
  column: string
  op: FilterOp
}

export interface ResourceConfig<
  S extends string,
  F extends Record<string, unknown>
> {
  table: string
  baseConditions: readonly string[]
  sortColumns: Record<S, string>
  filters: readonly FilterDescriptor<F>[]
  fingerprintKeys: readonly (keyof F & string)[]
}

// ─── Files ──────────────────────────────────────────────────────────────────

export type FilesSortBy = 'created_at' | 'updated_at' | 'name' | 'size'

export interface FilesFilterSet {
  user_id: string
  service_id: string
  folder_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search?: string
  mime_type?: string
}

export const RESOURCE_CONFIG_FILES: ResourceConfig<FilesSortBy, FilesFilterSet> = {
  table: 'files',
  baseConditions: ['is_main_storage = 0'],
  sortColumns: {
    created_at: 'created_at',
    updated_at: 'updated_at',
    name: 'filename',
    size: 'size',
  },
  filters: [
    { key: 'user_id',    column: 'user_id',    op: '=' },
    { key: 'service_id', column: 'service_id', op: '=' },
    { key: 'folder_id',  column: 'folder_id',  op: 'IS_NULL_OR_EQ' },
    { key: 'search',     column: 'filename',   op: 'LIKE_ESCAPED' },
    { key: 'mime_type',  column: 'mime_type',  op: '=' },
  ],
  fingerprintKeys: ['user_id', 'service_id', 'folder_id', 'trash', 'search', 'mime_type'],
}

// ─── Folders ────────────────────────────────────────────────────────────────

export type FoldersSortBy = 'created_at' | 'updated_at' | 'name'

export interface FoldersFilterSet {
  user_id: string
  service_id: string
  parent_id: string | null | undefined
  trash: 'active' | 'trashed' | 'all'
  search?: string
}

export const RESOURCE_CONFIG_FOLDERS: ResourceConfig<FoldersSortBy, FoldersFilterSet> = {
  table: 'folders',
  baseConditions: [],
  sortColumns: {
    created_at: 'created_at',
    updated_at: 'updated_at',
    name: 'name',
  },
  filters: [
    { key: 'user_id',    column: 'user_id',    op: '=' },
    { key: 'service_id', column: 'service_id', op: '=' },
    { key: 'parent_id',  column: 'parent_id',  op: 'IS_NULL_OR_EQ' },
    { key: 'search',     column: 'name',       op: 'LIKE_ESCAPED' },
  ],
  fingerprintKeys: ['user_id', 'service_id', 'parent_id', 'trash', 'search'],
}
