import { V2Error } from './errors'

interface ZodValidationResult {
  success: boolean
  error?: { issues: Array<{ message: string }> }
}

export function v2ValidationHook(result: ZodValidationResult, _c: unknown): void {
  if (result.success) return
  const err = result.error!
  const tooLong = err.issues.find((i) => i.message === 'search_too_long')
  if (tooLong) throw new V2Error('search_too_long', 400, 'Search query too long')
  throw new V2Error('validation_error', 400, 'Invalid request', err.issues)
}
