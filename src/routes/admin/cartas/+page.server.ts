import type { PageServerLoad } from './$types';
import { listarPredios } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const predios = await listarPredios(locals.supabase);
  return { predios };
};
