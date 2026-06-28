import type { PageServerLoad } from './$types';
import { listarQuadrasComContagem, listarTerritorios } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, territorios] = await Promise.all([
    listarQuadrasComContagem(locals.supabase),
    listarTerritorios(locals.supabase)
  ]);
  return { quadras, territorios };
};
