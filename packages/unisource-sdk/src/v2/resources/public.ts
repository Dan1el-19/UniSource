import {
  publicShareLinkResponseSchema,
  publicUnlockResponseSchema,
  type PublicShareLinkResponse,
  type PublicUnlockResponse,
} from '../public-schemas'
import type { V2Request } from '../transport'

/**
 * Public (anonymous) share-link endpoints. All requests use `auth: 'none'`
 * — Authorization header is intentionally omitted even when the parent client
 * is configured with `apiKey` or `getToken`.
 */
export function createPublicResource(request: V2Request, _baseUrl: string) {
  return {
    /**
     * GET /public/:slug — fetch share-link metadata.
     * The response is a discriminated union on `requires_password`:
     * - `false` → includes `download_url` and related fields (ready to download)
     * - `true`  → only metadata; caller must call `unlockShareLink` first
     */
    getShareLink: (
      slug: string,
      signal?: AbortSignal
    ): Promise<PublicShareLinkResponse> =>
      request('GET', `/public/${encodeURIComponent(slug)}`, {
        signal,
        auth: 'none',
        parser: publicShareLinkResponseSchema,
      }),

    /**
     * POST /public/:slug/unlock — submit password to unlock a protected link.
     * On success returns the full unlocked response (with `download_url`).
     */
    unlockShareLink: (
      slug: string,
      args: { password: string },
      signal?: AbortSignal
    ): Promise<PublicUnlockResponse> =>
      request('POST', `/public/${encodeURIComponent(slug)}/unlock`, {
        body: args,
        signal,
        auth: 'none',
        parser: publicUnlockResponseSchema,
      }),
  }
}
