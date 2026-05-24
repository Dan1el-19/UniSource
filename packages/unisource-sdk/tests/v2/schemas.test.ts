import { describe, it, expect } from 'vitest'
import { v2ListResponseSchema, v2ErrorSchema } from '../../src/v2/schemas'
import { v2FileSchema } from '../../src/v2/files'

describe('v2ListResponseSchema', () => {
  it('parses valid response', () => {
    const result = v2ListResponseSchema(v2FileSchema).parse({
      items: [],
      page: { limit: 25, next_cursor: null }
    })
    expect(result.items).toEqual([])
    expect(result.page.limit).toBe(25)
  })
  it('rejects missing page', () => {
    expect(() => v2ListResponseSchema(v2FileSchema).parse({ items: [] })).toThrow()
  })
})

describe('v2ErrorSchema', () => {
  it('parses valid error', () => {
    const result = v2ErrorSchema.parse({
      error: { code: 'cursor_invalid', message: 'bad cursor', request_id: 'abc' }
    })
    expect(result.error.code).toBe('cursor_invalid')
  })
})
