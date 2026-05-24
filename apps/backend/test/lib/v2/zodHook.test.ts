import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { v2ValidationHook } from '../../../src/lib/v2/zodHook'
import { V2Error } from '../../../src/lib/v2/errors'

describe('v2ValidationHook', () => {
  const schema = z.object({
    search: z.string().max(100, { message: 'search_too_long' }).optional(),
    sort_by: z.enum(['a', 'b']),
  })

  function parse(input: unknown) {
    return schema.safeParse(input)
  }

  it('returns undefined on success', () => {
    const result = parse({ sort_by: 'a' })
    expect(v2ValidationHook(result, {} as any)).toBeUndefined()
  })

  it('throws V2Error("search_too_long") when search message matches', () => {
    const result = parse({ search: 'x'.repeat(101), sort_by: 'a' })
    expect(() => v2ValidationHook(result, {} as any)).toThrow(V2Error)
    try {
      v2ValidationHook(result, {} as any)
    } catch (e) {
      expect((e as V2Error).code).toBe('search_too_long')
      expect((e as V2Error).status).toBe(400)
    }
  })

  it('throws V2Error("validation_error") with issues for other errors', () => {
    const result = parse({ sort_by: 'invalid' })
    try {
      v2ValidationHook(result, {} as any)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as V2Error).code).toBe('validation_error')
      expect((e as V2Error).status).toBe(400)
      expect((e as V2Error).details).toBeDefined()
    }
  })
})
