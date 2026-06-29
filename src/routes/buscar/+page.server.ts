import type { PageServerLoad } from './$types';
import { selectAll } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals, url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) return { q, quadras: [], locais: [], unidades: [] };

  // Busca quadras pelo ID
  const { data: quadras } = await locals.supabase
    .from('quadras')
    .select('id, color, territorio_id, status')
    .ilike('id', `%${q}%`)
    .limit(20);

  // Busca locais por nome/logradouro/numero
  const { data: locais } = await locals.supabase
    .from('locais')
    .select('id, tipo, logradouro, numero, nome, quadra_id')
    .or(`logradouro.ilike.%${q}%,nome.ilike.%${q}%,numero.ilike.%${q}%`)
    .limit(30);

  return {
    q,
    quadras: quadras ?? [],
    locais: locais ?? []
  };
};
