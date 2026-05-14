import type { PageServerLoad, Actions } from './$types';
import { getServiceCors, putServiceCors } from '$lib/api';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ request, params }) => {
  const { origins } = await getServiceCors(request, params.id);
  return { origins };
};

export const actions: Actions = {
  default: async ({ request, params }) => {
    const form = await request.formData();
    const raw = form.get('origins') as string;
    const origins = raw.split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      await putServiceCors(request, params.id, origins);
      return { saved: true };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },
};
