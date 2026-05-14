import type { PageServerLoad, Actions } from './$types';
import { listServiceKeys, createServiceKey, revokeServiceKey, rotateServiceKey, patchServiceKey } from '$lib/api';
import type { Permission } from '$lib/api';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ request, params }) => {
  const { keys } = await listServiceKeys(request, params.id);
  return { keys };
};

export const actions: Actions = {
  create: async ({ request, params }) => {
    const form = await request.formData();
    const name = form.get('name') as string;
    const permissions = (form.get('permissions') as string).split(',').map((p) => p.trim()) as Permission[];
    const corsRaw = form.get('cors_origins') as string;
    const cors_origins = corsRaw ? corsRaw.split('\n').map((s) => s.trim()).filter(Boolean) : undefined;

    try {
      const { key } = await createServiceKey(request, params.id, { name, permissions, cors_origins });
      return { created: key };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },

  revoke: async ({ request, params }) => {
    const form = await request.formData();
    const keyId = form.get('keyId') as string;
    try {
      await revokeServiceKey(request, params.id, keyId);
      return { revoked: true };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },

  rotate: async ({ request, params }) => {
    const form = await request.formData();
    const keyId = form.get('keyId') as string;
    try {
      const { key } = await rotateServiceKey(request, params.id, keyId);
      return { rotated: key };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },

  patch: async ({ request, params }) => {
    const form = await request.formData();
    const keyId = form.get('keyId') as string;
    const name = form.get('name') as string | undefined;
    const permRaw = form.get('permissions') as string | undefined;
    const permissions = permRaw ? (permRaw.split(',').map((p) => p.trim()) as Permission[]) : undefined;
    try {
      const { key } = await patchServiceKey(request, params.id, keyId, { name: name || undefined, permissions });
      return { patched: key };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },
};
