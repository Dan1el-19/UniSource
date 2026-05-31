import { describe, it, expect } from 'vitest'
import { V2_ERROR_CODES as backendCodes } from '../../../src/lib/v2/error-codes'
import { V2_ERROR_CODES as sdkCodes } from '@unisource/sdk/v2'

describe('V2_ERROR_CODES contract — backend ⇄ SDK', () => {
  it('have identical length', () => {
    expect(backendCodes.length).toBe(sdkCodes.length)
  })

  it('contain identical sets of codes', () => {
    expect(new Set(backendCodes)).toEqual(new Set(sdkCodes))
  })

  it('are byte-identical when sorted', () => {
    const sortedBackend = [...backendCodes].sort()
    const sortedSdk = [...sdkCodes].sort()
    expect(sortedBackend).toEqual(sortedSdk)
  })

  it('are at the same positions (order preserved)', () => {
    expect([...backendCodes]).toEqual([...sdkCodes])
  })
})
