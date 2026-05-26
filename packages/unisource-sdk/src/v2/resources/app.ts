import type { AppReleaseLatestResponse } from '../../releases'
import { appReleaseLatestResponseSchema } from '../../releases'
import type { V2Request } from '../transport'

export function createAppResource(request: V2Request) {
  return {
    latestRelease: (
      query?: { channel?: string },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<AppReleaseLatestResponse> =>
      request('GET', '/app/releases/latest', {
        query,
        signal,
        asUser: options?.asUser,
        parser: appReleaseLatestResponseSchema,
      }),
  }
}
