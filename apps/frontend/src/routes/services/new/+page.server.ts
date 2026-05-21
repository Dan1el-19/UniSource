import type { Actions } from './$types';
import { createService } from '$lib/api';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const object_key_prefix = (form.get('object_key_prefix') as string | null)?.trim() || '';
    const body = {
      id: form.get('id') as string,
      name: form.get('name') as string,
      default_bucket: form.get('default_bucket') as string,
      max_storage_bytes: Number(form.get('max_storage_bytes')),
      max_file_size_bytes: Number(form.get('max_file_size_bytes')),
      recommended_upload_destination: (form.get('recommended_upload_destination') as 'r2' | 'appwrite' | 'hybrid') || 'r2',
      object_key_prefix,
    };

    if (!body.id || !body.name || !body.default_bucket) {
      return fail(400, { error: 'id, name, and default_bucket are required' });
    }

    try {
      await createService(request, body);
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed to create service' });
    }

    throw redirect(303, `/services/${body.id}`);
  },
};
