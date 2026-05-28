import { describe, it, expect } from 'vitest'
import { V2_ERROR_CODES, isV2ErrorCode, type V2ErrorCode } from '../../src/v2/error-codes'

describe('V2_ERROR_CODES', () => {
  it('contains the closed set of 11 known codes', () => {
    expect(V2_ERROR_CODES).toEqual([
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
    ])
  })

  it('is readonly tuple (as const)', () => {
    const code: V2ErrorCode = 'not_found'
    expect(code).toBe('not_found')
  })
})

describe('isV2ErrorCode', () => {
  it('returns true for known codes', () => {
    expect(isV2ErrorCode('not_found')).toBe(true)
    expect(isV2ErrorCode('conflict')).toBe(true)
    expect(isV2ErrorCode('validation_error')).toBe(true)
  })

  it('returns false for unknown codes', () => {
    expect(isV2ErrorCode('not_a_code')).toBe(false)
    expect(isV2ErrorCode('')).toBe(false)
    expect(isV2ErrorCode('cycle_detected')).toBe(false)
  })

  it('narrows the type correctly', () => {
    const x: string = 'not_found'
    if (isV2ErrorCode(x)) {
      const code: V2ErrorCode = x
      expect(code).toBe('not_found')
    }
  })
})
