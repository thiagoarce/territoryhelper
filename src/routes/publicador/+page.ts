// W5: load UNIVERSAL no BROWSER (ssr=false) com cache offline — a home
// é a CARTEIRA do publicador, a tela que precisa abrir na rua sem
// sinal. Network-first com fallback pro cache (comCache); leituras vão
// direto browser→Supabase via RLS (mesma sessão do locals.supabase).
// Actions continuam em +page.server.ts.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { supabaseBrowser } from '$lib/supabase-browser';
import { hojeIsoBrasil } from '$lib/utils/data';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra, cicloCartasPorLocal, cicloEfetivo } from '$lib/queries';
import { cartaEscritaNoCiclo } from '$lib/ciclos';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';
import { arranjoAindaVale, precisaFinalizar } from '$lib/arranjos';
import { comCache } from '$lib/offline/cache-leitura';

export const ssr = false;

export interface CampanhaAtiva {
  id: number;
  nome: string;
  data_inicio: string;
  data_alvo: string;
  meta_semanal: number | null;
  concluidas_no_periodo: number;
  total_meta: number;
  status: StatusCampanha;
  diasParaComecar: number;
  notasSuprimento: string | null;
  imagemUrl: string | null;
}

export interface MeuAgendamentoTp {
  agendamento_id: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  ponto_nome: string;
}

export interface MeuPedidoPublicacao {
  id: number;
  publicacao_nome: string | null;
  descricao: string | null;
  qtd: number;
  status: 'aberto' | 'pedido' | 'entregue' | 'cancelado';
  criado_em: string;
}

export interface PublicacaoLite {
  id: number;
  nome: string;
  categoria: string;
  qtd_estoque: number;
  imagem_url: string | null;
}

export interface RevistaMensalLite {
  id: number;
  nome: string;
  imagem_url: string | null;
}

export interface NecessidadeRegularLinha {
  publicacao_id: number;
  variante: 'publico' | 'estudo';
  qtd: number;
  letras_grandes: boolean;
}

export interface ArranjoPendenteFinalizar {
  id: number;
  nome: string;
  data: string;
  quadras_ids: string[];
  cartas_locais_ids: number[];
}


export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');
  const r = await comCache(`campo:home:${profile.id}`, () => carregar(profile.id, profile.role ?? ''));
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};

async function carregar(minhaId: string, role: string) {
  const supabase = supabaseBrowser();
  const hoje = hojeIsoBrasil();
  const ontem = hojeIsoBrasil(-1);
  const em7dias = hojeIsoBrasil(7);
  const ha60dias = hojeIsoBrasil(-60);

  const [designacoes, quadras, campanhaRes, partesRes, dirijoRes, profRes, meusTurnosRes, participacoesRes, meusPedidosRes, catalogoRes, necessidadeRes, revistasRes] = await Promise.all([
    listarDesignacoes(supabase),
    listarQuadrasComGeo(supabase),
    supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id, publicacoes(imagem_url)')
      .eq('ativa', true)
      .maybeSingle(),
    // Partes de arranjo que me incluem (dupla/trio) — recorrente continua
    // valendo mesmo com a data-âncora do arranjo no passado (filtra em JS
    // abaixo, não dá pra expressar recorrente/data_fim num .or() simples)
    supabase
      .from('arranjo_partes')
      .select('id, quadras_ids, locais_ids, publicadores, notas, arranjos!inner(id, nome, data, hora_inicio, local_endereco, dirigente_id, ativo, recorrente, data_fim)')
      .contains('publicadores', [minhaId])
      .eq('arranjos.ativo', true)
      .order('criada_em', { ascending: false }),
    // Arranjos que EU dirijo — card "Você dirige" (futuros/atuais) + os
    // últimos 60 dias (pra achar os que passaram e ainda não foram
    // finalizados — "Finalize a designação")
    supabase
      .from('arranjos')
      .select('id, nome, data, hora_inicio, local_endereco, quadras_ids, cartas_locais_ids, tces_ids, recorrente, data_fim')
      .eq('ativo', true)
      .eq('dirigente_id', minhaId)
      .or(`data.gte.${ha60dias},data.is.null,recorrente.eq.true`)
      .order('data', { nullsFirst: false })
      .limit(50),
    supabase.from('profiles').select('id, nome'),
    // Meus agendamentos de TP nos próximos 7 dias — seção "Seus turnos de TP" no home
    supabase
      .from('tp_agendamento_participantes')
      .select('agendamento_id, data, tp_agendamentos!inner(hora_inicio, hora_fim, ponto_avulso, tp_pontos(nome))')
      .eq('publicador_id', minhaId)
      .gte('data', hoje)
      .lte('data', em7dias)
      .order('data'),
    // Designações onde EU sou participante (dupla/trio), não o líder —
    // sem isso a carteira só aparecia pra quem criou a designação
    supabase.from('designacao_publicadores').select('designacao_id').eq('publicador_id', minhaId),
    // Meus pedidos de publicação (P-A) — pra ver o status mudar quando o servo atender
    supabase
      .from('pedidos_publicacao')
      .select('id, descricao, qtd, status, criado_em, publicacoes(nome)')
      .eq('publicador_id', minhaId)
      .order('criado_em', { ascending: false })
      .limit(10),
    // A12b: revistas mensais (periodicidade='mensal') saem do catálogo de
    // pedido especial avulso — têm o fluxo próprio de necessidade regular.
    supabase.from('publicacoes').select('id, nome, categoria, qtd_estoque, imagem_url').eq('ativo', true).is('periodicidade', null).order('categoria').order('nome'),
    // Necessidade regular de revistas (Despertai/Sentinela) — preferência informativa, sem status
    supabase
      .from('publicador_necessidade_regular')
      .select('publicacao_id, variante, qtd, letras_grandes')
      .eq('publicador_id', minhaId),
    supabase.from('publicacoes').select('id, nome, imagem_url').eq('ativo', true).eq('periodicidade', 'mensal').order('nome')
  ]);
  // Home = CARTEIRA PESSOAL, mesmo pra dirigente/admin (que são publicadores
  // no campo). A visão de todas as designações mora no mapa estratégico e
  // no hub /admin/designacoes — não aqui.
  const minhasComoParticipante = new Set((participacoesRes.data ?? []).map((r: any) => r.designacao_id));
  const minhas = designacoes.filter(
    (d) => d.publicador_id === minhaId || minhasComoParticipante.has(d.id)
  );
  const abertas = minhas.filter((d) => d.status === 'aberta');
  const concluidas = minhas.filter((d) => d.status === 'concluida');

  const partesValidas = (partesRes.data ?? []).filter((p: any) => arranjoAindaVale(p.arranjos, ontem));
  const dirijoValidos = (dirijoRes.data ?? []).filter((a: any) => arranjoAindaVale(a, ontem));

  // Arranjos que dirijo cujo dia já passou (ou é hoje e já são 20h+) e
  // ainda estão ativos — a home só AVISA (a ação "Finalizar designação"
  // mora em Casa a casa, junto do resto das ações de dirigente).
  const pendentesFinalizar: ArranjoPendenteFinalizar[] = ((dirijoRes.data ?? []) as any[])
    .filter((a) => precisaFinalizar(a, hoje))
    .map((a) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[]
    }));

  // Cobertura pra barra de progresso nos cards do home: território pessoal
  // + quadras dos arranjos que dirijo + da minha parte (dupla/trio) +
  // pendentes de finalizar
  const idsPartes = partesValidas.flatMap((p: any) => p.quadras_ids ?? []);
  const idsDirijo = dirijoValidos.flatMap((a: any) => a.quadras_ids ?? []);
  const idsPendentes = pendentesFinalizar.flatMap((a) => a.quadras_ids);
  const idsCobertura = [...new Set([...abertas.flatMap((d) => d.quadras_ids), ...idsPartes, ...idsDirijo, ...idsPendentes])];
  const cobertura = idsCobertura.length > 0
    ? await calcularCoberturaPorQuadra(supabase, idsCobertura)
    : new Map();

  const quadrasMap = new Map(quadras.map((q) => [q.id, q]));

  // A21-f2: TCEs "meus" via publicador_id direto OU via designação
  // pessoal (designacao_tces) — a home mescla os dois mecanismos.
  const [{ data: tceDiretoRows }, { data: tceViaDesRows }] = await Promise.all([
    supabase
      .from('tces')
      .select('id, nome, tipo, prazo, status')
      .eq('status', 'aberto')
      .not('publicador_id', 'is', null),
    supabase
      .from('designacao_tces')
      .select('tces!inner(id, nome, tipo, prazo, status), designacoes!inner(status)')
      .eq('tces.status', 'aberto')
      .eq('designacoes.status', 'aberta')
  ]);
  const tcesPorId = new Map<string, { id: string; nome: string; tipo: string; prazo: string | null; status: string }>();
  for (const t of (tceDiretoRows ?? []) as any[]) tcesPorId.set(t.id, t);
  for (const r of (tceViaDesRows ?? []) as any[]) if (r.tces) tcesPorId.set(r.tces.id, r.tces);
  const tces = [...tcesPorId.values()].sort((a, b) => (a.prazo ?? '9999-99-99').localeCompare(b.prazo ?? '9999-99-99'));

  // Campanha ativa: card destacado no topo (specs.md Fase 2)
  let campanhaAtiva: CampanhaAtiva | null = null;
  const c = campanhaRes.data as any;
  if (c) {
    const conclNoPeriodo = quadras.filter(
      (q) => q.data_conclusao && q.data_conclusao >= c.data_inicio && q.data_conclusao <= c.data_alvo
    ).length;
    const diasParaComecar = Math.max(0, Math.ceil(
      (new Date(c.data_inicio + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    // Notas de suprimento da publicação principal — texto livre, sem cálculo
    // (ex: "levar 20 convites por publicador"), pra aparecer no card do campo.
    let notasSuprimento: string | null = null;
    if (c.publicacao_id) {
      const { data: supr } = await supabase
        .from('campanha_suprimentos')
        .select('notas')
        .eq('campanha_id', c.id)
        .eq('publicacao_id', c.publicacao_id)
        .maybeSingle();
      notasSuprimento = supr?.notas ?? null;
    }
    campanhaAtiva = {
      id: c.id,
      nome: c.nome,
      data_inicio: c.data_inicio,
      data_alvo: c.data_alvo,
      meta_semanal: c.meta_semanal,
      notasSuprimento,
      imagemUrl: c.publicacoes?.imagem_url ?? null,
      concluidas_no_periodo: conclNoPeriodo,
      total_meta: quadras.length,
      status: statusCampanha(c),
      diasParaComecar
    };
  }

  // Partes de arranjo que eu recebi (card no topo do home)
  const nomePorId = new Map((profRes.data ?? []).map((p: any) => [p.id, p.nome as string]));
  const minhasPartes = partesValidas.map((p: any) => ({
    id: p.id,
    arranjo_id: p.arranjos?.id ?? null,
    arranjo_nome: p.arranjos?.nome ?? 'Arranjo',
    arranjo_data: p.arranjos?.data ?? null,
    hora_inicio: p.arranjos?.hora_inicio ?? null,
    local_endereco: p.arranjos?.local_endereco ?? null,
    dirigente_nome: p.arranjos?.dirigente_id ? nomePorId.get(p.arranjos.dirigente_id) ?? '?' : null,
    colegas: (p.publicadores as string[])
      .filter((id) => id !== minhaId)
      .map((id) => nomePorId.get(id) ?? '?'),
    quadras_ids: p.quadras_ids as string[],
    locais_ids: p.locais_ids as number[]
  }));

  // Arranjos que eu dirijo — card "Você dirige" mostra só o PRÓXIMO (evita
  // encher a home); os demais entram num indicativo "+N outras" com modal.
  const arranjosQueDirijoOrdenados = dirijoValidos
    .slice()
    .sort((a: any, b: any) => (a.data ?? '').localeCompare(b.data ?? ''))
    .map((a: any) => ({
      id: a.id,
      nome: a.nome ?? 'Arranjo',
      data: a.data as string,
      hora_inicio: a.hora_inicio as string | null,
      local_endereco: a.local_endereco as string | null,
      quadras_ids: (a.quadras_ids ?? []) as string[],
      cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
      tces_ids: (a.tces_ids ?? []) as string[]
    }));
  const arranjoQueDirijo = arranjosQueDirijoOrdenados[0] ?? null;
  const outrosArranjosQueDirijo = arranjosQueDirijoOrdenados.slice(1);

  // Designações de cartas (tipo='cartas') — resolve prédios associados via
  // designacao_locais + tabela locais pra mostrar chip clicável no home
  const abertasCartas = abertas.filter((d: any) => d.tipo === 'cartas');
  let cartasDesignadas: {
    designacao_id: number;
    prazo: string | null;
    predios: { id: number; nome: string | null; logradouro: string; numero: string; qtd_entregues: number; qtd_aptos: number }[];
  }[] = [];
  if (abertasCartas.length > 0) {
    const desigIds = abertasCartas.map((d) => d.id);
    const { data: locaisJoin } = await supabase
      .from('designacao_locais')
      .select('designacao_id, local_id')
      .in('designacao_id', desigIds);
    const localIds = Array.from(new Set((locaisJoin ?? []).map((r: any) => r.local_id)));
    if (localIds.length > 0) {
      const [locDetalhes, unidsPorLocal, ciclos] = await Promise.all([
        supabase.from('locais').select('id, nome, logradouro, numero').in('id', localIds),
        supabase.from('unidades').select('local_id, carta_entregue').in('local_id', localIds),
        cicloCartasPorLocal(supabase, localIds)
      ]);
      const stats: Record<number, { qtd: number; ent: number }> = {};
      for (const u of (unidsPorLocal.data ?? []) as any[]) {
        const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
        s.qtd++;
        if (cartaEscritaNoCiclo(u.carta_entregue, cicloEfetivo(ciclos, u.local_id)?.iniciado_em)) s.ent++;
      }
      const detById = new Map((locDetalhes.data ?? []).map((l: any) => [l.id, l]));
      const prediosPorDesig: Record<number, any[]> = {};
      for (const j of (locaisJoin ?? []) as any[]) {
        const l = detById.get(j.local_id);
        if (!l) continue;
        (prediosPorDesig[j.designacao_id] ||= []).push({
          id: l.id,
          nome: l.nome,
          logradouro: l.logradouro,
          numero: l.numero,
          qtd_entregues: stats[l.id]?.ent ?? 0,
          qtd_aptos: stats[l.id]?.qtd ?? 0
        });
      }
      cartasDesignadas = abertasCartas.map((d: any) => ({
        designacao_id: d.id,
        prazo: d.prazo,
        predios: prediosPorDesig[d.id] ?? []
      }));
    }
  }

  const meusAgendamentosTp: MeuAgendamentoTp[] = ((meusTurnosRes.data ?? []) as any[]).map((r) => ({
    agendamento_id: r.agendamento_id,
    data: r.data,
    hora_inicio: r.tp_agendamentos.hora_inicio,
    hora_fim: r.tp_agendamentos.hora_fim,
    ponto_nome: r.tp_agendamentos.tp_pontos?.nome ?? r.tp_agendamentos.ponto_avulso ?? '?'
  }));

  const meusPedidosPublicacao: MeuPedidoPublicacao[] = ((meusPedidosRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    publicacao_nome: p.publicacoes?.nome ?? null,
    descricao: p.descricao,
    qtd: p.qtd,
    status: p.status,
    criado_em: p.criado_em
  }));
  const catalogoPublicacoes = (catalogoRes.data ?? []) as PublicacaoLite[];
  const necessidadeRegular = (necessidadeRes.data ?? []) as NecessidadeRegularLinha[];
  const revistasMensais = (revistasRes.data ?? []) as RevistaMensalLite[];

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    cobertura: Object.fromEntries(cobertura),
    tces,
    campanhaAtiva,
    minhasPartes,
    arranjoQueDirijo,
    outrosArranjosQueDirijo,
    pendentesFinalizar,
    cartasDesignadas,
    meusAgendamentosTp,
    meusPedidosPublicacao,
    catalogoPublicacoes,
    necessidadeRegular,
    revistasMensais,
    minhaRole: role
  };
}
