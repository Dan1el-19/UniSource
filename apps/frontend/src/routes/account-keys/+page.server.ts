import type { PageServerLoad, Actions } from './$types';
import { listAccountKeys, listServices, createAccountKey, revokeAccountKey, patchAccountKey } from '$lib/api';
import type { Permission } from '$lib/api';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ request }) => {
  const [{ keys }, { services }] = await Promise.all([
    listAccountKeys(request),
    listServices(request),
  ]);
  return { keys, services };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await request.formData();
    const name = form.get('name') as string;
    const permissions = (form.get('permissions') as string).split(',').map((p) => p.trim()) as Permission[];
    const service_ids = (form.get('service_ids') as string).split(',').map((s) => s.trim()).filter(Boolean);
    try {
      const { key } = await createAccountKey(request, { name, permissions, service_ids });
      return { created: key };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },

  revoke: async ({ request }) => {
    const form = await request.formData();
    const keyId = form.get('keyId') as string;
    try {
      await revokeAccountKey(request, keyId);
      return { revoked: true };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },

  patch: async ({ request }) => {
    const form = await request.formData();
    const keyId = form.get('keyId') as string;
    const name = form.get('name') as string | undefined;
    const permRaw = form.get('permissions') as string | undefined;
    const svcRaw = form.get('service_ids') as string | undefined;
    const permissions = permRaw ? (permRaw.split(',').map((p) => p.trim()) as Permission[]) : undefined;
    const service_ids = svcRaw ? svcRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    try {
      const { key } = await patchAccountKey(request, keyId, { name: name || undefined, permissions, service_ids });
      return { patched: key };
    } catch (e: unknown) {
      return fail(400, { error: e instanceof Error ? e.message : 'Failed' });
    }
  },
};
