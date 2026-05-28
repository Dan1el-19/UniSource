// @beta — see docs/api-v2-architecture.md
export * from './legacy-draft'

// New v2 beta API
export * from './types'
export * from './files'
export * from './folders'
export * from './my-files-schemas'
export * from './schemas'
export * from './errors'
export { V2_ERROR_CODES, isV2ErrorCode } from './error-codes'
export type { V2ErrorCode } from './error-codes'
export { v2BulkResponseSchema, v2BulkFailureSchema } from './bulk-schemas'
export type { V2BulkResponse, V2BulkFailure } from './bulk-schemas'
export type { V2FoldersBulkRequest } from './resources/folders'
export { UnisourceV2Client } from './client'
export type { UnisourceV2ClientConfig } from './client'
