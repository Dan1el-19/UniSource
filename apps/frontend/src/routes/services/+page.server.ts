import type { PageServerLoad, Actions } from './$types';
import { listServices, deleteService } from '$lib/api';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ request }) => {
  const { services } = await listServices(request);
  return { services };
};

export const actions: Actions = {
  delete: async ({ request, params: _params }) => {
    const form = await request.formData();
    const id = form.get('id') as string;
    if (!id) return fail(400, { error: 'Missing id' });
    try {
      await deleteService(request, id);
    } catch (e: unknown) {
      return fail(500, { error: e instanceof Error ? e.message : 'Failed' });
    }
    throw redirect(303, '/services');
  },
};
