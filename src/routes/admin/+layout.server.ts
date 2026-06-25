import { exigirRole } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  exigirRole(locals, ['admin']);
  return {};
};
