import type { PageServerLoad } from './$types';

const API_URL = process.env.PUBLIC_API_URL || 'http://localhost:8787';

export const load: PageServerLoad = async ({ params }) => {
  const { slug } = params;

  try {
    const res = await fetch(`${API_URL}/public/${encodeURIComponent(slug)}`);
    const data = await res.json() as Record<string, unknown>;

    return { slug, status: res.status, error: res.ok ? null : ((data as any).message ?? 'Link not found'), data: res.ok ? data : null };
  } catch {
    return { slug, status: 503, error: 'Service unavailable', data: null };
  }
};
