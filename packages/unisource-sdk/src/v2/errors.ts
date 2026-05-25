export class UnisourceV2Error extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly requestId: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'UnisourceV2Error'
  }
}
