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
export function createPublicResource(request: V2Request, baseUrl: string) {
  return {
    /**
     * GET /v2/public/:slug — fetch share-link metadata.
     * The response is a discriminated union on `requires_password`:
     * - `false` → includes `download_url` and related fields (ready to download)
     * - `true`  → only metadata; caller must call `unlockShareLink` first
     */
    getShareLink: (
      slug: string,
      signal?: AbortSignal
    ): Promise<PublicShareLinkResponse> =>
      request('GET', `/v2/public/${encodeURIComponent(slug)}`, {
        signal,
        auth: 'none',
        parser: publicShareLinkResponseSchema,
      }),

    /**
     * POST /v2/public/:slug/unlock — submit password to unlock a protected link.
     * On success returns the full unlocked response (with `download_url`).
     */
    unlockShareLink: (
      slug: string,
      args: { password: string },
      signal?: AbortSignal
    ): Promise<PublicUnlockResponse> =>
      request('POST', `/v2/public/${encodeURIComponent(slug)}/unlock`, {
        body: args,
        signal,
        auth: 'none',
        parser: publicUnlockResponseSchema,
      }),

    /**
     * Construct the redirect URL for `GET /v2/public/:slug/download?token=...`
     * — pure URL builder, does NOT perform a network request. The caller is
     * expected to navigate the browser to this URL (the backend issues a 302
     * to the real storage URL).
     */
    buildDownloadUrl: (slug: string, token: string): string => {
      const url = new URL(`/v2/public/${encodeURIComponent(slug)}/download`, baseUrl)
      url.searchParams.set('token', token)
      return url.toString()
    },
  }
}
