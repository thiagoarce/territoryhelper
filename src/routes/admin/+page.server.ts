import type { PageServerLoad } from './$types';
import { listarQuadrasComGeo, listarDesignacoes } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  // Quadras "alocadas" = quadras que aparecem em alguma designação aberta
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);
  return { quadras, designacoesAbertas: abertas, quadrasAlocadas: [...quadrasAlocadas] };
};
