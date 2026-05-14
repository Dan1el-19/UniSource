import type { PageServerLoad } from './$types';
import { listServices } from '$lib/api';

export const load: PageServerLoad = async ({ request }) => {
  const { services } = await listServices(request);
  return { services };
};
