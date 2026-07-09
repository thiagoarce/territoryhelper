// W8 ("modo rua"): fetchers de LEITURA das telas de trabalho do campo,
// compartilhados entre (a) os loads universais de
// /publicador/quadra/[id] e /publicador/tce/[id] e (b) o prefetch da
// carteira disparado pela home — MESMA chave de cache e MESMO shape de
// valor, senão o prefetch não serve pra nada.
//
// Roda no BROWSER (client supabase-browser) — RLS decide o que o
// usuário enxerga, igual quando rodava no server com locals.supabase.
import { error } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { carregarQuadraComLocais, cicloCartasPorLocal, cicloEfetivo, type DadosQuadraTrabalho } from '$lib/queries';
import { gravarCache } from '$lib/offline/cache-leitura';
import { arranjoAindaVale } from '$lib/arranjos';
import { podeTrabalharQuadra } from '$lib/posse';
import { hojeIsoBrasil } from '$lib/utils/data';

export function chaveQuadraCampo(quadraId: string, userId: string): string {
  return `campo:quadra:${quadraId}:${userId}`;
}
export function chaveTceCampo(tceId: string, userId: string): string {
  return `campo:tce:${tceId}:${userId}`;
}

// Versão portável do guard exigirQuadraDesignada (guards.ts, server) —
// MESMAS cláusulas, espelhando pode_editar_local (RLS, migration 040).
// Diferença: recebe client+identidade em vez de locals, e LANÇA os erros
// de query (uma query falhada não pode virar "sem posse" — offline, por
// exemplo, precisa virar fallback de cache, não 403).
export async function verificarPosseQuadra(
  quadraId: string,
  userId: string,
  role: string
): Promise<boolean> {
  if (role === 'admin' || role === 'dirigente') return true;
  const supabase = supabaseBrowser();
  const ontem = hojeIsoBrasil(-1);

  const [dqRes, dqPartRes, partesRes] = await Promise.all([
    supabase
      .from('designacao_quadras')
      .select('designacao_id, designacoes!inner(publicador_id, status)')
      .eq('quadra_id', quadraId)
      .eq('designacoes.publicador_id', userId)
      .eq('designacoes.status', 'aberta')
      .limit(1),
    supabase
      .from('designacao_quadras')
      .select('designacao_id, designacoes!inner(status, designacao_publicadores!inner(publicador_id))')
      .eq('quadra_id', quadraId)
      .eq('designacoes.status', 'aberta')
      .eq('designacoes.designacao_publicadores.publicador_id', userId)
      .limit(1),
    supabase
      .from('arranjo_partes')
      .select('id, arranjos!inner(ativo, data, recorrente, data_fim)')
      .contains('publicadores', [userId])
      .contains('quadras_ids', [quadraId])
      .eq('arranjos.ativo', true)
  ]);
  if (dqRes.error) throw dqRes.error;
  if (dqPartRes.error) throw dqPartRes.error;
  if (partesRes.error) throw partesRes.error;
  const partesValidas = (partesRes.data ?? []).filter((p: any) => arranjoAindaVale(p.arranjos, ontem));

  let ehColegaDeArranjo = false;
  if (!dqRes.data?.length && !dqPartRes.data?.length && !partesValidas.length) {
    const { data: arranjosDaQuadraRaw, error: e1 } = await supabase
      .from('arranjos')
      .select('id, data, recorrente, data_fim')
      .eq('ativo', true)
      .contains('quadras_ids', [quadraId]);
    if (e1) throw e1;
    const arranjosDaQuadra = (arranjosDaQuadraRaw ?? []).filter((a) => arranjoAindaVale(a, ontem));
    if (arranjosDaQuadra.length > 0) {
      const { data: partesDoArranjo, error: e2 } = await supabase
        .from('arranjo_partes')
        .select('id')
        .in('arranjo_id', arranjosDaQuadra.map((a) => a.id))
        .contains('publicadores', [userId])
        .limit(1);
      if (e2) throw e2;
      ehColegaDeArranjo = !!partesDoArranjo?.length;
    }
  }

  return podeTrabalharQuadra({
    ehAdminOuDirigente: false,
    ehLiderDeDesignacaoAberta: !!dqRes.data?.length,
    ehParticipanteDeDesignacaoAberta: !!dqPartRes.data?.length,
    ehIncluidoEmParteDeArranjoAtiva: !!partesValidas.length,
    quadraEmArranjoAtivo: ehColegaDeArranjo
  });
}

export type DadosQuadraCampo = DadosQuadraTrabalho & { cicloCartasPorLocal: Record<number, string | null> };

export async function carregarQuadraCampo(quadraId: string): Promise<DadosQuadraCampo> {
  const supabase = supabaseBrowser();
  const dados = await carregarQuadraComLocais(supabase, quadraId);
  if (!dados) throw error(404, 'Quadra não encontrada');
  const ciclos = await cicloCartasPorLocal(supabase, dados.locais.map((l) => l.id));
  const cicloCartasPorLocalMap: Record<number, string | null> = {};
  for (const l of dados.locais) {
    cicloCartasPorLocalMap[l.id] = cicloEfetivo(ciclos, l.id)?.iniciado_em ?? null;
  }
  return { ...dados, cicloCartasPorLocal: cicloCartasPorLocalMap };
}

export interface TceEndereco {
  unidade_id: number;
  local_id: number;
  logradouro: string;
  numero: string;
  nome: string | null;
  complemento: string | null;
  tipo: string;
  ultimoTipo: string | null;
  cartaEntregue: boolean;
  geo_geojson: unknown | null;
}

export interface DadosTceCampo {
  tce: { id: string; nome: string; tipo: string; prazo: string | null; status: string; notas: string | null };
  enderecos: TceEndereco[];
}

export async function carregarTceCampo(tceId: string): Promise<DadosTceCampo> {
  const supabase = supabaseBrowser();
  // RLS garante que só vê TCE designado a ele (ou admin)
  const { data: tce, error: errT } = await supabase
    .from('tces')
    .select('id, nome, tipo, prazo, status, notas')
    .eq('id', tceId)
    .maybeSingle();
  if (errT) throw errT;
  if (!tce) throw error(404, 'TCE não encontrado');

  const { data: vinculos, error: errV } = await supabase
    .from('tce_unidades')
    .select('unidade_id, unidades(id, complemento, local_id, locais(id, logradouro, numero, nome, tipo))')
    .eq('tce_id', tceId);
  if (errV) throw errV;

  const unidadeIds = (vinculos ?? []).map((v: any) => v.unidade_id);

  const ultimoPorUnidade = new Map<number, string>();
  if (unidadeIds.length > 0) {
    const { data: regs, error: errR } = await supabase
      .from('registros')
      .select('unidade_id, tipo, ts')
      .in('unidade_id', unidadeIds)
      .order('ts', { ascending: false });
    if (errR) throw errR;
    for (const r of regs ?? []) {
      if (!ultimoPorUnidade.has(r.unidade_id)) ultimoPorUnidade.set(r.unidade_id, r.tipo);
    }
  }

  const localIds = [...new Set((vinculos ?? []).map((v: any) => v.unidades?.locais?.id).filter(Boolean))];
  const geoPorLocal = new Map<number, unknown>();
  if (localIds.length > 0) {
    const { data: geoRows, error: errG } = await supabase.from('locais_geo').select('id, geo_geojson').in('id', localIds);
    if (errG) throw errG;
    for (const g of (geoRows ?? []) as any[]) geoPorLocal.set(g.id, g.geo_geojson);
  }

  const enderecos: TceEndereco[] = (vinculos ?? []).map((v: any) => {
    const u = v.unidades;
    const l = u?.locais;
    const ult = ultimoPorUnidade.get(v.unidade_id) ?? null;
    return {
      unidade_id: v.unidade_id,
      local_id: l?.id ?? 0,
      logradouro: l?.logradouro ?? '(sem)',
      numero: l?.numero ?? 's/n',
      nome: l?.nome ?? null,
      complemento: u?.complemento ?? null,
      tipo: l?.tipo ?? 'comercio',
      ultimoTipo: ult === 'desfeito' || ult === 'carta_undo' ? null : ult,
      cartaEntregue: ult === 'carta',
      geo_geojson: l?.id ? geoPorLocal.get(l.id) ?? null : null
    };
  }).sort((a, b) =>
    a.logradouro.localeCompare(b.logradouro) || a.numero.localeCompare(b.numero)
  );

  return { tce, enderecos };
}

// Prefetch da carteira ("baixar pra usar offline"): aquece o cache das
// quadras/TCEs designados a mim, em background, quando a home abre com
// rede. Sequencial em pares — sem estourar o aparelho nem o Supabase.
// Best-effort: falha de um item não derruba os demais.
export async function prefetchCarteira(userId: string, quadraIds: string[], tceIds: string[]): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const tarefas: (() => Promise<void>)[] = [
    ...quadraIds.map((qid) => async () => {
      const valor = await carregarQuadraCampo(qid);
      await gravarCache(chaveQuadraCampo(qid, userId), valor);
    }),
    ...tceIds.map((tid) => async () => {
      const valor = await carregarTceCampo(tid);
      await gravarCache(chaveTceCampo(tid, userId), valor);
    })
  ];
  const LOTE = 2;
  for (let i = 0; i < tarefas.length; i += LOTE) {
    await Promise.all(tarefas.slice(i, i + LOTE).map((t) => t().catch(() => {})));
  }
}
