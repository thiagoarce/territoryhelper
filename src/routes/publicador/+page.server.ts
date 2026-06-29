import type { PageServerLoad } from './$types';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [designacoes, quadras] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const concluidas = designacoes.filter((d) => d.status === 'concluida');

  // Cobertura só pras quadras DAS DESIGNAÇÕES ABERTAS (não calcula tudo)
  const idsAbertas = [...new Set(abertas.flatMap((d) => d.quadras_ids))];
  const cobertura = idsAbertas.length > 0
    ? await calcularCoberturaPorQuadra(locals.supabase, idsAbertas)
    : new Map();

  // Mapa quadra_id → quadra (pra mostrar cor + território + polígono no card)
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    cobertura: Object.fromEntries(cobertura),
    minhaRole: locals.profile?.role
  };
};
