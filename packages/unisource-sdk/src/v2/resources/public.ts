import {
  publicShareLinkResponseSchema,
  type PublicShareLinkResponse,
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
  }
}
