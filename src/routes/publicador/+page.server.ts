import type { PageServerLoad } from './$types';
import { listarDesignacoes, listarQuadrasComContagem } from '$lib/server/queries';

// Pra publicador: RLS filtra automaticamente as designacoes pelas suas.
// Admin/dirigente vêem tudo via policy "designacoes_admin_all".
// Não fazemos query extra — confiamos no RLS.
export const load: PageServerLoad = async ({ locals }) => {
  const [designacoes, quadras] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComContagem(locals.supabase)
  ]);

  // Mapa quadra_id → quadra (pra mostrar cor + território no card)
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  // Só designações abertas no painel principal
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const concluidas = designacoes.filter((d) => d.status === 'concluida');

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    minhaRole: locals.profile?.role
  };
};
