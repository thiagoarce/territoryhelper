import type { PageServerLoad } from './$types';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra } from '$lib/server/queries';

export interface CampanhaAtiva {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  concluidas_no_periodo: number;
  total_meta: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [designacoes, quadras, campanhaRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa')
      .eq('ativa', true)
      .maybeSingle()
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const concluidas = designacoes.filter((d) => d.status === 'concluida');

  const idsAbertas = [...new Set(abertas.flatMap((d) => d.quadras_ids))];
  const cobertura = idsAbertas.length > 0
    ? await calcularCoberturaPorQuadra(locals.supabase, idsAbertas)
    : new Map();

  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  const { data: tceRows } = await locals.supabase
    .from('tces')
    .select('id, nome, tipo, prazo, status')
    .eq('status', 'aberto')
    .not('publicador_id', 'is', null)
    .order('prazo', { nullsFirst: false });
  const tces = (tceRows ?? []) as { id: string; nome: string; tipo: string; prazo: string | null; status: string }[];

  // Campanha ativa: card destacado no topo (specs.md Fase 2)
  let campanhaAtiva: CampanhaAtiva | null = null;
  const c = campanhaRes.data as any;
  if (c) {
    const conclNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    ).length;
    campanhaAtiva = {
      id: c.id,
      nome: c.nome,
      data_inicio: c.data_inicio,
      data_alvo: c.data_alvo,
      meta_semanal: c.meta_semanal,
      concluidas_no_periodo: conclNoPeriodo,
      total_meta: quadras.length
    };
  }

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    cobertura: Object.fromEntries(cobertura),
    tces,
    campanhaAtiva,
    minhaRole: locals.profile?.role
  };
};
