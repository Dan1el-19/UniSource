import type { PageServerLoad } from './$types';
import type { PublicFileAccessResponse, PublicFileLockedResponse, ApiError } from '@unisource/sdk';

const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:8787';

export type PublicPageData = {
  slug: string;
  status: number;
  error: string | null;
  data: PublicFileAccessResponse | PublicFileLockedResponse | null;
};

export const load: PageServerLoad<PublicPageData> = async ({ params }) => {
  const { slug } = params;

  try {
    const res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}`);
    const json = await res.json() as PublicFileAccessResponse | PublicFileLockedResponse | ApiError;

    if (!res.ok) {
      const err = json as ApiError;
      return { slug, status: res.status, error: err.message ?? 'Link not found', data: null };
    }

    return { slug, status: res.status, error: null, data: json as PublicFileAccessResponse | PublicFileLockedResponse };
  } catch {
    return { slug, status: 503, error: 'Service unavailable', data: null };
  }
};

