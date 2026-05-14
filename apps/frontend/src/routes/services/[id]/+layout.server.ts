import type { LayoutServerLoad } from './$types';
import { getService } from '$lib/api';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ request, params }) => {
  try {
    const { service } = await getService(request, params.id);
    return { service };
  } catch {
    throw error(404, 'Service not found');
  }
};
