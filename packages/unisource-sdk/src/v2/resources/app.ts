import type { AppReleaseLatestResponse } from '../../v1/releases'
import { appReleaseLatestResponseSchema } from '../../v1/releases'
import type { V2Request } from '../transport'

export function createAppResource(request: V2Request) {
  return {
    latestRelease: (
      query?: { channel?: string },
      signal?: AbortSignal,
      options?: { asUser?: string }
    ): Promise<AppReleaseLatestResponse> =>
      request('GET', '/v2/app/releases/latest', {
        query,
        signal,
        asUser: options?.asUser,
        parser: appReleaseLatestResponseSchema,
      }),
  }
}
