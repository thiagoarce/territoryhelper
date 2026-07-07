import type { Actions, PageServerLoad } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra, cicloCartasPorLocal, cicloEfetivo } from '$lib/server/queries';
import { cartaEscritaNoCiclo } from '$lib/ciclos';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';
import { arranjoAindaVale, precisaFinalizar } from '$lib/arranjos';

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

export const load: PageServerLoad = async ({ locals }) => {
  const hoje = hojeIsoBrasil();
  const ontem = hojeIsoBrasil(-1);
  const em7dias = hojeIsoBrasil(7);
  const ha60dias = hojeIsoBrasil(-60);

  const [designacoes, quadras, campanhaRes, partesRes, dirijoRes, profRes, meusTurnosRes, participacoesRes, meusPedidosRes, catalogoRes, necessidadeRes, revistasRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id, publicacoes(imagem_url)')
      .eq('ativa', true)
      .maybeSingle(),
    // Partes de arranjo que me incluem (dupla/trio) — recorrente continua
    // valendo mesmo com a data-âncora do arranjo no passado (filtra em JS
    // abaixo, não dá pra expressar recorrente/data_fim num .or() simples)
    locals.supabase
      .from('arranjo_partes')
      .select('id, quadras_ids, locais_ids, publicadores, notas, arranjos!inner(id, nome, data, hora_inicio, local_endereco, dirigente_id, ativo, recorrente, data_fim)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true)
      .order('criada_em', { ascending: false }),
    // Arranjos que EU dirijo — card "Você dirige" (futuros/atuais) + os
    // últimos 60 dias (pra achar os que passaram e ainda não foram
    // finalizados — "Finalize a designação")
    locals.supabase
      .from('arranjos')
      .select('id, nome, data, hora_inicio, local_endereco, quadras_ids, cartas_locais_ids, tce_id, recorrente, data_fim')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${ha60dias},data.is.null,recorrente.eq.true`)
      .order('data', { nullsFirst: false })
      .limit(50),
    locals.supabase.from('profiles').select('id, nome'),
    // Meus agendamentos de TP nos próximos 7 dias — seção "Seus turnos de TP" no home
    locals.supabase
      .from('tp_agendamento_participantes')
      .select('agendamento_id, data, tp_agendamentos!inner(hora_inicio, hora_fim, ponto_avulso, tp_pontos(nome))')
      .eq('publicador_id', locals.user!.id)
      .gte('data', hoje)
      .lte('data', em7dias)
      .order('data'),
    // Designações onde EU sou participante (dupla/trio), não o líder —
    // sem isso a carteira só aparecia pra quem criou a designação
    locals.supabase.from('designacao_publicadores').select('designacao_id').eq('publicador_id', locals.user!.id),
    // Meus pedidos de publicação (P-A) — pra ver o status mudar quando o servo atender
    locals.supabase
      .from('pedidos_publicacao')
      .select('id, descricao, qtd, status, criado_em, publicacoes(nome)')
      .eq('publicador_id', locals.user!.id)
      .order('criado_em', { ascending: false })
      .limit(10),
    // A12b: revistas mensais (periodicidade='mensal') saem do catálogo de
    // pedido especial avulso — têm o fluxo próprio de necessidade regular.
    locals.supabase.from('publicacoes').select('id, nome, categoria, qtd_estoque, imagem_url').eq('ativo', true).is('periodicidade', null).order('categoria').order('nome'),
    // Necessidade regular de revistas (Despertai/Sentinela) — preferência informativa, sem status
    locals.supabase
      .from('publicador_necessidade_regular')
      .select('publicacao_id, variante, qtd, letras_grandes')
      .eq('publicador_id', locals.user!.id),
    locals.supabase.from('publicacoes').select('id, nome, imagem_url').eq('ativo', true).eq('periodicidade', 'mensal').order('nome')
  ]);
  // Home = CARTEIRA PESSOAL, mesmo pra dirigente/admin (que são publicadores
  // no campo). A visão de todas as designações mora no mapa estratégico e
  // no hub /admin/designacoes — não aqui.
  const minhasComoParticipante = new Set((participacoesRes.data ?? []).map((r: any) => r.designacao_id));
  const minhas = designacoes.filter(
    (d) => d.publicador_id === locals.user!.id || minhasComoParticipante.has(d.id)
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
    ? await calcularCoberturaPorQuadra(locals.supabase, idsCobertura)
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
    const diasParaComecar = Math.max(0, Math.ceil(
      (new Date(c.data_inicio + 'T12:00:00').getTime() - Date.now()) / 86400000
    ));
    // Notas de suprimento da publicação principal — texto livre, sem cálculo
    // (ex: "levar 20 convites por publicador"), pra aparecer no card do campo.
    let notasSuprimento: string | null = null;
    if (c.publicacao_id) {
      const { data: supr } = await locals.supabase
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
      .filter((id) => id !== locals.user!.id)
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
      tce_id: a.tce_id as string | null
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
    const { data: locaisJoin } = await locals.supabase
      .from('designacao_locais')
      .select('designacao_id, local_id')
      .in('designacao_id', desigIds);
    const localIds = Array.from(new Set((locaisJoin ?? []).map((r: any) => r.local_id)));
    if (localIds.length > 0) {
      const [locDetalhes, unidsPorLocal, ciclos] = await Promise.all([
        locals.supabase.from('locais').select('id, nome, logradouro, numero').in('id', localIds),
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', localIds),
        cicloCartasPorLocal(locals.supabase, localIds)
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
    minhaRole: locals.profile?.role
  };
};

export const actions: Actions = {
  // Link público /t/<token> — da PRÓPRIA designação (RLS permite o dono)
  // OU de um arranjo (dirigente/admin, pelo card "Você dirige")
  gerarLinkTerritorio: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const designacaoId = Number(fd.get('designacao_id') ?? 0);
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    if (!designacaoId && !arranjoId) return fail(400, { erro: 'id obrigatório' });
    const row: any = { criado_por: locals.user.id };
    if (arranjoId) row.arranjo_id = arranjoId;
    else row.designacao_id = designacaoId;
    const { data, error } = await locals.supabase
      .from('territorio_tokens')
      .insert(row)
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  },

  // Pedido de publicação avulso (P-A) — catálogo OU descrição livre.
  pedirPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const qtd = Number(fd.get('qtd') ?? 1) || 1;
    if (!publicacaoId && !descricao) return fail(400, { erro: 'Escolha uma publicação do catálogo ou descreva o que precisa' });
    const { error } = await locals.supabase.from('pedidos_publicacao').insert({
      publicador_id: locals.user.id,
      publicacao_id: publicacaoId,
      descricao: publicacaoId ? null : descricao,
      qtd
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Pedido enviado ao servo de publicações' };
  },

  // Cancela um pedido MEU ainda aberto (RLS só deixa enquanto status='aberto')
  cancelarPedidoPublicacao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('pedidos_publicacao')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Pedido cancelado' };
  },

  // "Normalmente preciso de N por edição" — Despertai/Sentinela chegam
  // pela via normal, isso é só uma preferência informativa pro servo, não
  // um pedido com status (diferente de pedirPublicacao acima).
  salvarNecessidadeRegular: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0);
    const variante = String(fd.get('variante') ?? 'publico');
    const qtd = Number(fd.get('qtd') ?? 0);
    const letrasGrandes = fd.get('letras_grandes') === 'true';
    if (!publicacaoId) return fail(400, { erro: 'publicacao_id obrigatório' });
    if (!['publico', 'estudo'].includes(variante)) return fail(400, { erro: 'variante inválida' });
    if (qtd < 0) return fail(400, { erro: 'Quantidade inválida' });
    const { error } = await locals.supabase.from('publicador_necessidade_regular').upsert(
      {
        publicador_id: locals.user.id, publicacao_id: publicacaoId, variante, qtd,
        letras_grandes: letrasGrandes, atualizado_em: new Date().toISOString()
      },
      { onConflict: 'publicador_id,publicacao_id,variante' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Salvo' };
  }
};
