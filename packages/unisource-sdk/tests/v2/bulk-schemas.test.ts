import { describe, it, expect } from 'vitest'
import { v2BulkResponseSchema, v2BulkFailureSchema } from '../../src/v2/bulk-schemas'

describe('v2BulkResponseSchema', () => {
  it('parses a valid response with processed and failed', () => {
    const body = {
      processed: ['file_a', 'file_b'],
      failed: [
        { id: 'file_c', code: 'not_found', message: 'File not found' },
        { id: 'file_d', code: 'conflict', message: 'Already in trash' },
      ],
    }
    const parsed = v2BulkResponseSchema.parse(body)
    expect(parsed).toEqual(body)
  })

  it('parses a response with empty failed array', () => {
    const body = { processed: ['a', 'b', 'c'], failed: [] }
    expect(v2BulkResponseSchema.parse(body)).toEqual(body)
  })

  it('parses a response with empty processed array', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'not_found', message: 'gone' }],
    }
    expect(v2BulkResponseSchema.parse(body)).toEqual(body)
  })

  it('rejects a failure entry with unknown code', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'teapot', message: 'wat' }],
    }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })

  it('rejects when processed is not an array', () => {
    const body = { processed: 'nope', failed: [] }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })

  it('rejects a failure entry without message', () => {
    const body = {
      processed: [],
      failed: [{ id: 'x', code: 'not_found' }],
    }
    expect(() => v2BulkResponseSchema.parse(body)).toThrow()
  })
})

describe('v2BulkFailureSchema', () => {
  it('parses a single failure entry', () => {
    const f = { id: 'file_x', code: 'conflict', message: 'busy' }
    expect(v2BulkFailureSchema.parse(f)).toEqual(f)
  })

  it('rejects empty id', () => {
    expect(() => v2BulkFailureSchema.parse({ id: '', code: 'not_found', message: 'm' }))
      .toThrow()
  })
})
