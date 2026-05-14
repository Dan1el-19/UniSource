import type { Actions } from './$types';
import { patchService } from '$lib/api';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request, params }) => {
    const form = await request.formData();
    const body: Record<string, unknown> = {};

    const name = form.get('name') as string;
    const default_bucket = form.get('default_bucket') as string;
    const max_storage_bytes = Number(form.get('max_storage_bytes'));
    const max_file_size_bytes = Number(form.get('max_file_size_bytes'));
    const recommended_upload_destination = form.get('recommended_upload_destination') as string;

    if (name) body.name = name;
    if (default_bucket) body.default_bucket = default_bucket;
    if (max_storage_bytes > 0) body.max_storage_bytes = max_storage_bytes;
    if (max_file_size_bytes > 0) body.max_file_size_bytes = max_file_size_bytes;
    if (recommended_upload_destination) body.recommended_upload_destination = recommended_upload_destination;

    try {
      await patchService(request, params.id, body);
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed to update service' });
    }

    throw redirect(303, `/services/${params.id}`);
  },
};
