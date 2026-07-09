// W3: load UNIVERSAL rodando 100% no BROWSER (ssr=false) — as leituras
// da Geral vão direto browser→Supabase (mesma sessão/RLS que o
// locals.supabase usava), sem passar pelo Worker. Motivo: no plano free
// o CPU do Worker é ~10ms CUMULATIVO por invocação; este load (quadras+
// geo + designações + publicadores + TCEs + campanha + curadoria) +
// serialização devalue era o que estourava 1102 — principalmente porque
// cada action da tela chama invalidateAll(), reexecutando tudo. Agora o
// invalidateAll() reexecuta AQUI, no browser, de graça pro Worker.
// As actions continuam em +page.server.ts (guards/defesa em
// profundidade intactos). O guard de rota (exigirRole em
// /admin/+layout.server.ts) continua barrando não-admin.
import type { PageLoad } from './$types';
import { supabaseBrowser } from '$lib/supabase-browser';
import { listarQuadrasComGeo, listarDesignacoes, listarPublicadores } from '$lib/queries';
import { statusCampanha } from '$lib/campanhas';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export interface TceComQuadras {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  prazo: string | null;
  publicador_nome: string | null;
  quadras_ids: string[];
}

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  // W5: network-first com fallback pro cache — offline, a Geral abre
  // com o último estado conhecido (leitura; ações continuam pedindo rede).
  const r = await comCache(`admin:geral:${profile?.id ?? 'anon'}`, () => carregar());
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar() {
  const supabase = supabaseBrowser();
  const [quadras, designacoes, publicadores, campanhaRes, curadoriaPendenteRes, tcesRes] = await Promise.all([
    listarQuadrasComGeo(supabase),
    listarDesignacoes(supabase),
    listarPublicadores(supabase),
    supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, ativa')
      .eq('ativa', true)
      .maybeSingle(),
    // A24: "Feedback do campo" — resumo da fila de curadoria (T12 constrói a
    // tela de revisão; aqui é só o contador + link).
    supabase.from('curadoria_edicoes').select('tipo').eq('status', 'pendente'),
    // A21-f1: TCEs pro filtro "TCEs" — quadras_ids pré-agregado pela view
    // tces_com_quadras (migration 070).
    supabase
      .from('tces_com_quadras')
      .select('id, nome, tipo, status, prazo, publicador_id, quadras_ids')
      .order('nome')
  ]);
  const publicadorIdsTce = [...new Set(((tcesRes.data ?? []) as any[]).map((t) => t.publicador_id).filter(Boolean))];
  const nomesTce = new Map<string, string>();
  if (publicadorIdsTce.length > 0) {
    const { data: profRows } = await supabase.from('profiles').select('id, nome').in('id', publicadorIdsTce);
    for (const p of (profRows ?? []) as any[]) nomesTce.set(p.id, p.nome);
  }
  const tces: TceComQuadras[] = ((tcesRes.data ?? []) as any[]).map((t) => ({
    id: t.id, nome: t.nome, tipo: t.tipo, status: t.status, prazo: t.prazo,
    publicador_nome: t.publicador_id ? (nomesTce.get(t.publicador_id) ?? null) : null,
    quadras_ids: t.quadras_ids ?? []
  }));
  const curadoriaPendente = {
    total: curadoriaPendenteRes.data?.length ?? 0,
    edicao: (curadoriaPendenteRes.data ?? []).filter((c: any) => c.tipo === 'edicao').length,
    criacao: (curadoriaPendenteRes.data ?? []).filter((c: any) => c.tipo === 'criacao').length,
    nao_existe: (curadoriaPendenteRes.data ?? []).filter((c: any) => c.tipo === 'nao_existe').length
  };
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  const quadrasAlocadas = new Set<string>();
  for (const d of abertas) for (const q of d.quadras_ids) quadrasAlocadas.add(q);
  // Quadras em arranjos ativos também contam como alocadas (trava).
  // O arranjo É o trava — não precisa criar designacao paralela.

  const campanhaAtiva = campanhaRes.data ?? null;
  const campanhaPlanejada = campanhaAtiva && statusCampanha(campanhaAtiva) === 'planejada' ? campanhaAtiva : null;
  // Quadras reservadas pra ELA (visual + trava). Enquanto a campanha não
  // começa, reserva também conta como alocada (não pode ir pra outro lugar).
  const reservadasIds = campanhaAtiva
    ? quadras.filter((q) => q.reservada_campanha_id === campanhaAtiva.id).map((q) => q.id)
    : [];
  if (campanhaPlanejada) for (const q of reservadasIds) quadrasAlocadas.add(q);

  // Arranjos do tipo 'quadras' (pra anexar quadras selecionadas via Visão Geral)
  const { data: modsQ } = await supabase
    .from('arranjo_modalidades').select('id, nome, tipo_territorio, cor');
  const modsQuadrasIds = new Set((modsQ ?? []).filter((m: any) => m.tipo_territorio === 'quadras').map((m: any) => m.id));
  const { data: arranjosRaw } = await supabase
    .from('arranjos')
    .select('id, nome, modalidade_id, data, dia_semana, recorrente, quadras_ids, hora_inicio, ativo')
    .eq('ativo', true)
    .order('data', { nullsFirst: false })
    .order('hora_inicio', { nullsFirst: false });
  const modById = new Map((modsQ ?? []).map((m: any) => [m.id, m]));
  const arranjosQuadras = (arranjosRaw ?? [])
    .filter((a: any) => modsQuadrasIds.has(a.modalidade_id))
    .map((a: any) => ({
      ...a,
      modalidade_nome: modById.get(a.modalidade_id)?.nome ?? '?',
      modalidade_cor: modById.get(a.modalidade_id)?.cor ?? '#3b82f6'
    }));

  // Trava de arranjos: cada quadra em arranjo ativo é "alocada" (sem precisar
  // criar designação paralela — o próprio arranjo é a trava).
  const arranjoPorQuadra: Record<string, { id: number; nome: string; modalidade_nome: string; modalidade_cor: string; data: string | null }> = {};
  for (const a of arranjosQuadras) {
    for (const q of (a.quadras_ids ?? []) as string[]) {
      quadrasAlocadas.add(q);
      if (!arranjoPorQuadra[q]) {
        arranjoPorQuadra[q] = {
          id: a.id,
          nome: a.nome || a.modalidade_nome,
          modalidade_nome: a.modalidade_nome,
          modalidade_cor: a.modalidade_cor,
          data: a.data
        };
      }
    }
  }

  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    quadrasAlocadas: [...quadrasAlocadas],
    arranjosQuadras,
    arranjoPorQuadra,
    campanhaAtiva,
    campanhaPlanejada,
    reservadasIds,
    curadoriaPendente,
    tces
  };
}
