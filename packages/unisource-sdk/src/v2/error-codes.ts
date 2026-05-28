/**
 * Closed set of V2 error codes. Mirror of apps/backend/src/lib/v2/error-codes.ts.
 * Synchronization is enforced by the contract test in apps/backend/test/lib/v2/error-codes.contract.test.ts.
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

export function isV2ErrorCode(x: string): x is V2ErrorCode {
  return (V2_ERROR_CODES as readonly string[]).includes(x)
}
