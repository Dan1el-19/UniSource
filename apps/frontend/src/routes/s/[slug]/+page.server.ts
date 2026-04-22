import type { PageServerLoad } from './$types';
import type { PublicFileAccessResponse, PublicFileLockedResponse } from '@unisource/sdk';
import { getPublicFileInfo, UnisourceError } from '@unisource/sdk';

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
    const data = await getPublicFileInfo(API_URL, slug);
    return { slug, status: 200, error: null, data };
  } catch (error) {
    if (error instanceof UnisourceError) {
      return {
        slug,
        status: error.status,
        error: error.body.message ?? 'Link not found',
        data: null,
      };
    }

    return { slug, status: 503, error: 'Service unavailable', data: null };
  }
};

