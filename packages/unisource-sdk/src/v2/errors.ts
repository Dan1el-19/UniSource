import type { V2ErrorCode } from './error-codes'

export class UnisourceV2Error extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: V2ErrorCode | 'unknown',
    public readonly requestId: string,
    public readonly details?: unknown,
    /**
     * Original code string from backend when it was not a known V2ErrorCode.
     * Useful for debugging when SDK is older than backend.
     */
    public readonly rawCode?: string
  ) {
    super(message)
    this.name = 'UnisourceV2Error'
  }
}
