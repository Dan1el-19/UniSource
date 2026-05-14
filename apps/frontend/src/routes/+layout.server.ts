import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }
  return { user: locals.user };
};
