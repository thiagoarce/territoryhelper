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
import type { PontoReferencia } from '$lib/pontos-referencia';
import type { ConclusaoLado } from '$lib/lados';

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

export type DadosQuadraCampo = DadosQuadraTrabalho & {
  cicloCartasPorLocal: Record<number, string | null>;
  arranjoHoraInicio: string | null;
  /** OPCIONAL de propósito: um payload gravado no cache ANTES desta
   *  feature não tem o campo, e o comCache devolve o valor antigo sem
   *  revalidar. Todo consumo usa `?? []` — nunca bumpar a chave de
   *  cache por causa disso (invalidaria o offline de quem está na rua). */
  pontosReferencia?: PontoReferencia[];
  /** também opcional: cache gravado antes da feature de lados não tem */
  ladosConclusoes?: ConclusaoLado[];
};

export async function carregarQuadraCampo(quadraId: string): Promise<DadosQuadraCampo> {
  const supabase = supabaseBrowser();
  const dados = await carregarQuadraComLocais(supabase, quadraId);
  if (!dados) throw error(404, 'Quadra não encontrada');
  const ciclos = await cicloCartasPorLocal(supabase, dados.locais.map((l) => l.id));
  const cicloCartasPorLocalMap: Record<number, string | null> = {};
  for (const l of dados.locais) {
    cicloCartasPorLocalMap[l.id] = cicloEfetivo(ciclos, l.id)?.iniciado_em ?? null;
  }
  // Pré-preenche a hora de conclusão com a do arranjo vinculado, se
  // houver — arranjo ativo cuja quadras_ids contém esta quadra. Só um
  // convite/atalho (o servo ainda pode editar), não precisa ser exato.
  const { data: arr } = await supabase
    .from('arranjos')
    .select('hora_inicio')
    .eq('ativo', true)
    .contains('quadras_ids', [quadraId])
    .not('hora_inicio', 'is', null)
    .order('data', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  // Pontos de referência nomeados pela congregação, dessa quadra ou do
  // território dela ("Banco do Brasil da Fernando"). Não dependem de
  // rede na hora do uso: entram no payload cacheado, então funcionam
  // no modo rua mesmo com a Overpass fora do ar.
  const [pontos, ladosRes] = await Promise.all([
    pontosDaQuadra(supabase, quadraId, dados.quadra.territorio_id ?? null),
    // Conclusões por LADO (migration 092) — progresso do ciclo atual.
    supabase
      .from('quadra_lados_conclusoes')
      .select('lado_chave, lado_rotulo, data_conclusao, marcado_em')
      .eq('quadra_id', quadraId)
  ]);
  if (ladosRes.error) throw ladosRes.error;
  return {
    ...dados,
    cicloCartasPorLocal: cicloCartasPorLocalMap,
    arranjoHoraInicio: arr?.hora_inicio ?? null,
    pontosReferencia: pontos,
    ladosConclusoes: (ladosRes.data ?? []) as ConclusaoLado[]
  };
}

/** Pontos da quadra + os do território (que servem pra quadra vizinha). */
export async function pontosDaQuadra(
  supabase: ReturnType<typeof supabaseBrowser>,
  quadraId: string,
  territorioId: string | null
): Promise<PontoReferencia[]> {
  let q = supabase
    .from('pontos_referencia_geo')
    .select('id, nome, tipo, notas, quadra_id, territorio_id, osm_id, geo_geojson')
    .eq('ativo', true);
  q = territorioId
    ? q.or(`quadra_id.eq.${quadraId},territorio_id.eq.${territorioId}`)
    : q.eq('quadra_id', quadraId);
  const res = await q;
  // Query crua do supabase-js NÃO lança em erro de rede — sem este
  // check o comCache gravaria a tela sem pontos por cima do snapshot bom.
  if (res.error) throw res.error;
  return (res.data ?? [])
    .map((p: any) => {
      const c = p.geo_geojson?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      return {
        id: p.id as number,
        nome: p.nome as string,
        tipo: p.tipo as PontoReferencia['tipo'],
        lat: c[1] as number,
        lng: c[0] as number,
        notas: p.notas ?? null,
        quadra_id: p.quadra_id ?? null,
        territorio_id: p.territorio_id ?? null,
        osm_id: p.osm_id ?? null
      } satisfies PontoReferencia;
    })
    .filter((p): p is PontoReferencia => p !== null);
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

// W12: "Baixar tudo agora" em /perfil — dispara o mesmo prefetch que a
// home dispara sozinha ao abrir com rede (W8/W9), mas sob demanda (ex:
// publicador quer garantir que baixou tudo ANTES de sair de casa, sem
// esperar a home carregar). Reusa carregarHomeCampo (mesma função do
// load da home) pra descobrir quadras/TCEs/prédios sem duplicar a
// lógica de "quais são as minhas designações/partes/arranjos".
export async function baixarTudoParaOffline(
  userId: string,
  role: string,
  tpAprovado: boolean
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const { carregarHomeCampo, chaveHomeCampo } = await import('../routes/publicador/+page');
  const home = await carregarHomeCampo(userId, role);
  await gravarCache(chaveHomeCampo(userId), home);

  const quadraIds = [...new Set([
    ...home.abertas.flatMap((d: any) => d.quadras_ids),
    ...home.minhasPartes.flatMap((p: any) => p.quadras_ids),
    ...(home.arranjoQueDirijo?.quadras_ids ?? []),
    ...home.outrosArranjosQueDirijo.flatMap((a: any) => a.quadras_ids),
    ...home.pendentesFinalizar.flatMap((a: any) => a.quadras_ids)
  ])] as string[];
  const tceIds = [...new Set([
    ...home.tces.map((t: any) => t.id),
    ...(home.arranjoQueDirijo?.tces_ids ?? []),
    ...home.outrosArranjosQueDirijo.flatMap((a: any) => a.tces_ids)
  ])] as string[];
  const predioIds = [...new Set(home.cartasDesignadas.flatMap((c: any) => c.predios.map((p: any) => p.id)))] as number[];
  const podeCoordenar = role === 'dirigente' || role === 'admin';
  const podeVerTp = role === 'admin' || tpAprovado;

  await Promise.all([
    prefetchCarteira(userId, quadraIds, tceIds),
    prefetchTelasDeCampo(userId, { podeCoordenar, podeVerTp, predioIds })
  ]);
}

// W9: prefetch das TELAS de campo restantes (agenda de grupo, TP, prédios,
// campanha) — completa o "baixar pra usar offline" iniciado no W8 (que só
// cobria quadra/TCE). Usa as MESMAS funções de carregamento + MESMAS
// chaves de cache que cada +page.ts usa no load, senão o prefetch não
// serve pra nada (o load abriria com uma chave diferente e cairia de
// novo na rede). Best-effort, mesmo padrão de prefetchCarteira.
export async function prefetchTelasDeCampo(
  userId: string,
  opts: { podeCoordenar: boolean; podeVerTp: boolean; predioIds: number[] }
): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const [
    { chaveArranjoCampo, carregarArranjoCampo },
    { chavePrediosCampo, carregarPrediosCampo },
    { chaveCampanhaCampo, carregarCampanhaCampo },
    { chavePredioCampo, carregarPredioCampo }
  ] = await Promise.all([
    import('../routes/publicador/arranjo/+page'),
    import('../routes/publicador/predios/+page'),
    import('../routes/publicador/campanha/+page'),
    import('../routes/predio/[id]/+page')
  ]);

  const tarefas: (() => Promise<void>)[] = [
    async () => gravarCache(chaveArranjoCampo(userId), await carregarArranjoCampo()),
    async () => gravarCache(chavePrediosCampo(userId), await carregarPrediosCampo(opts.podeCoordenar)),
    async () => gravarCache(chaveCampanhaCampo(userId), await carregarCampanhaCampo(userId)),
    ...opts.predioIds.map((id) => async () => gravarCache(chavePredioCampo(id, userId), await carregarPredioCampo(id)))
  ];
  if (opts.podeVerTp) {
    tarefas.push(async () => {
      const { chaveTpCampo, carregarTpCampo } = await import('../routes/publicador/tp/+page');
      await gravarCache(chaveTpCampo(userId), await carregarTpCampo(userId));
    });
  }

  const LOTE = 2;
  for (let i = 0; i < tarefas.length; i += LOTE) {
    await Promise.all(tarefas.slice(i, i + LOTE).map((t) => t().catch(() => {})));
  }
}
