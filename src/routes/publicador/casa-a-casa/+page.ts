// W4: load UNIVERSAL no BROWSER (ssr=false) — esta rota usa
// listarQuadrasComGeo (uma das 3 rotas que estouravam CPU no Worker).
// Leituras vão direto browser→Supabase (mesma sessão/RLS); o guard de
// rota continua em /publicador/+layout.server.ts e as actions em
// +page.server.ts. Identidade (id/role) vem do parent() — o root layout
// devolve session+profile.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { hojeIsoBrasil } from '$lib/utils/data';
import {
  listarDesignacoes,
  listarQuadrasComGeo,
  listarPublicadores,
  calcularCoberturaPorQuadra,
  type QuadraGeo,
  type CoberturaQuadra
} from '$lib/queries';
import { arranjoAindaVale, precisaFinalizar } from '$lib/arranjos';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export interface ArranjoQueDirijo {
  id: number;
  nome: string;
  data: string;
  quadras_ids: string[];
  cartas_locais_ids: number[];
  tces_ids: string[];
  interessados: string[];
}

export interface ParteLinha {
  id: number;
  arranjo_id: number;
  arranjo_nome: string;
  quadras_ids: string[];
  locais_ids: number[];
  tces_ids: string[];
  publicadores: string[];
  notas: string | null;
}

export interface MinhaParte {
  id: number;
  arranjo_nome: string;
  colegas: string[];
  quadras_ids: string[];
  locais_ids: number[];
  tces_ids: string[];
}

// Navegação: aba dedicada de "casa em casa" — mapa com GPS pra identificar
// qual quadra é qual dentro do território designado agora. Seções
// possíveis: (0) "finalize a designação" — arranjos que dirijo cujo dia
// já passou e ainda não fechei (toda AÇÃO do dirigente mora aqui, home
// só avisa e linka); (1) "seu grupo" — mapa do PRÓXIMO arranjo que
// dirijo (só o mais próximo, pra não encher a lista — os demais entram
// num indicativo "+N outras" com modal) + repartir território; (2) "sua
// parte" — mapa só do subconjunto que te cabe; (3) território pessoal.
export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  // W5: network-first com fallback pro cache — casa a casa abre offline
  // com o último estado conhecido.
  const r = await comCache(`campo:casa-a-casa:${profile.id}`, () => carregar(profile.id, profile.role ?? ''));
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar(minhaId: string, role: string) {
  const supabase = supabaseBrowser();

  const hoje = hojeIsoBrasil();
  const ontem = hojeIsoBrasil(-1);
  const ha60dias = hojeIsoBrasil(-60);
  const podeCoordenar = ['dirigente', 'admin'].includes(role);

  const [designacoes, quadras, partesMinhasRes, dirijoRes, profRes] = await Promise.all([
    listarDesignacoes(supabase),
    listarQuadrasComGeo(supabase),
    supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, tces_ids, publicadores, arranjos!inner(nome, ativo)')
      .contains('publicadores', [minhaId])
      .eq('arranjos.ativo', true),
    // Sem filtro de data aqui — pego 60 dias pra trás pra achar pendências
    // de finalizar + futuros, e filtro os dois casos em JS abaixo.
    supabase
      .from('arranjos')
      .select('id, nome, quadras_ids, cartas_locais_ids, tces_ids, interessados, recorrente, data, data_fim')
      .eq('ativo', true)
      .eq('dirigente_id', minhaId)
      .or(`data.gte.${ha60dias},data.is.null,recorrente.eq.true`)
      .limit(50),
    supabase.from('profiles').select('id, nome')
  ]);

  const nomesPorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));
  const quadrasPorArranjo = (ids: string[]): QuadraGeo[] => ids.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  const brutos = (dirijoRes.data ?? []) as any[];

  const arranjosQueDirijoOrdenados: ArranjoQueDirijo[] = brutos
    .filter((a) => arranjoAindaVale(a, ontem))
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))
    .map((a) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
      tces_ids: (a.tces_ids ?? []) as string[],
      interessados: (a.interessados ?? []) as string[]
    }));
  // Só o próximo aparece com mapa+repartir — o resto vira indicativo (evita
  // encher a tela quando o dirigente tem várias saídas na agenda).
  const arranjoQueDirijo = arranjosQueDirijoOrdenados[0] ?? null;
  const outrosArranjosQueDirijo = arranjosQueDirijoOrdenados.slice(1);

  // Arranjos que dirijo cujo dia já passou (ou é hoje 20h+) e ainda estão
  // ativos — "Finalize a designação" (toda ação do dirigente mora aqui).
  const pendentesFinalizar = brutos
    .filter((a) => precisaFinalizar(a, hoje))
    .map((a) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
      tces_ids: (a.tces_ids ?? []) as string[],
      quadrasGeo: quadrasPorArranjo((a.quadras_ids ?? []) as string[])
    }));

  const minhasPartes: MinhaParte[] = ((partesMinhasRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    arranjo_nome: p.arranjos?.nome ?? 'Arranjo',
    colegas: (p.publicadores as string[]).filter((id) => id !== minhaId).map((id) => nomesPorId.get(id) ?? '?'),
    quadras_ids: (p.quadras_ids ?? []) as string[],
    locais_ids: (p.locais_ids ?? []) as number[],
    tces_ids: (p.tces_ids ?? []) as string[]
  }));

  // Todas as partes JÁ CRIADAS dos arranjos que dirijo (válidos) — pra
  // lista "Partes criadas" + saber o que já foi repartido.
  let partesDosMeusArranjos: ParteLinha[] = [];
  let publicadoresParaRepartir: { id: string; nome: string; role: string }[] = [];
  if (podeCoordenar && arranjosQueDirijoOrdenados.length > 0) {
    const idsArranjos = arranjosQueDirijoOrdenados.map((a) => a.id);
    const [{ data: todasPartes }, pubs] = await Promise.all([
      supabase
        .from('arranjo_partes')
        .select('id, arranjo_id, quadras_ids, locais_ids, tces_ids, publicadores, notas')
        .in('arranjo_id', idsArranjos)
        .order('criada_em'),
      listarPublicadores(supabase)
    ]);
    const nomePorArranjo = new Map(arranjosQueDirijoOrdenados.map((a) => [a.id, a.nome]));
    partesDosMeusArranjos = ((todasPartes ?? []) as any[]).map((p) => ({
      id: p.id,
      arranjo_id: p.arranjo_id,
      arranjo_nome: nomePorArranjo.get(p.arranjo_id) ?? 'Arranjo',
      quadras_ids: (p.quadras_ids ?? []) as string[],
      locais_ids: (p.locais_ids ?? []) as number[],
      tces_ids: (p.tces_ids ?? []) as string[],
      publicadores: (p.publicadores ?? []) as string[],
      notas: p.notas ?? null
    }));
    publicadoresParaRepartir = pubs;
  }

  // Território pessoal (designação individual, não é grupo) — pra 3ª seção.
  const minhasComoLider = designacoes.filter((d: any) => d.publicador_id === minhaId && d.status === 'aberta' && d.tipo !== 'cartas');
  const idsPessoais = [...new Set(minhasComoLider.flatMap((d) => d.quadras_ids))];
  const territorioPessoal = idsPessoais.map((id) => quadrasMap.get(id)).filter(Boolean) as QuadraGeo[];

  // A21-f2: TCEs designados como território pessoal (via designacao_tces).
  let territorioPessoalTces: string[] = [];
  if (minhasComoLider.length > 0) {
    const { data: dtRows } = await supabase
      .from('designacao_tces')
      .select('tce_id')
      .in('designacao_id', minhasComoLider.map((d: any) => d.id));
    territorioPessoalTces = [...new Set((dtRows ?? []).map((r: any) => r.tce_id as string))];
  }

  // Nomes de TCEs referenciados (arranjo que dirijo, partes, pendências de
  // finalizar, território pessoal)
  const tceIdsRefs = [...new Set([
    ...arranjosQueDirijoOrdenados.flatMap((a) => a.tces_ids),
    ...pendentesFinalizar.flatMap((a) => a.tces_ids),
    ...minhasPartes.flatMap((p) => p.tces_ids),
    ...partesDosMeusArranjos.flatMap((p) => p.tces_ids),
    ...territorioPessoalTces
  ])];
  const tcesMap: Record<string, string> = {};
  if (tceIdsRefs.length > 0) {
    const { data: tcesRows } = await supabase.from('tces').select('id, nome').in('id', tceIdsRefs);
    for (const t of (tcesRows ?? []) as any[]) tcesMap[t.id] = t.nome;
  }

  // A2: cobertura por quadra do "Seu grupo" — pro sheet de ação (Concluir/
  // Compartilhar) mostrar X/Y endereços feitos. Arranjo sem quadras ainda
  // (dirigente designado antes do território ser anexado) não tem o que
  // cobrir — pula a query (calcularCoberturaPorQuadra já se protege
  // contra array vazio, mas nem vale a viagem de rede aqui).
  const coberturaPorQuadraMap = arranjoQueDirijo && arranjoQueDirijo.quadras_ids.length > 0
    ? await calcularCoberturaPorQuadra(supabase, arranjoQueDirijo.quadras_ids)
    : new Map<string, CoberturaQuadra>();
  const coberturaPorQuadra = Object.fromEntries(coberturaPorQuadraMap);

  return {
    arranjoQueDirijo: arranjoQueDirijo ? { ...arranjoQueDirijo, quadrasGeo: quadrasPorArranjo(arranjoQueDirijo.quadras_ids) } : null,
    coberturaPorQuadra,
    outrosArranjosQueDirijo,
    pendentesFinalizar,
    minhasPartes: minhasPartes.map((p) => ({ ...p, quadrasGeo: quadrasPorArranjo(p.quadras_ids) })),
    partesDosMeusArranjos,
    publicadoresParaRepartir,
    nomesPorId: Object.fromEntries(nomesPorId),
    tcesMap,
    territorioPessoal,
    territorioPessoalTces,
    minhaId
  };
}
