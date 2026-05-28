/**
 * Closed set of V2 error codes — backend copy.
 * MUST stay in sync with packages/unisource-sdk/src/v2/error-codes.ts.
 * Synchronization is enforced by apps/backend/test/lib/v2/error-codes.contract.test.ts.
 *
 * DO NOT import from @unisource/sdk here. The SDK is a downstream consumer
 * of the backend wire contract; mirroring with a contract test prevents
 * cyclic type dependencies.
 */
export const V2_ERROR_CODES = [
  'validation_error',
  'cursor_invalid',
  'search_too_long',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'internal_error',
  'conflict',
  'bad_gateway',
  'gone',
] as const

export type V2ErrorCode = typeof V2_ERROR_CODES[number]
