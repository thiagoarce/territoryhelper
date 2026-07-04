import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarDesignacoes, listarQuadrasComGeo, calcularCoberturaPorQuadra } from '$lib/server/queries';
import { statusCampanha, type StatusCampanha } from '$lib/campanhas';

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

export interface NecessidadeRegularLinha {
  publicacao_id: number;
  qtd: number;
}

export const load: PageServerLoad = async ({ locals }) => {
  const hoje = new Date().toISOString().substring(0, 10);
  const ontem = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
  const em7dias = new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10);

  const [designacoes, quadras, campanhaRes, partesRes, dirijoRes, profRes, meusTurnosRes, participacoesRes, meusPedidosRes, catalogoRes, necessidadeRes] = await Promise.all([
    listarDesignacoes(locals.supabase),
    listarQuadrasComGeo(locals.supabase),
    locals.supabase
      .from('campanhas')
      .select('id, nome, data_inicio, data_alvo, meta_semanal, ativa, publicacao_id, publicacoes(imagem_url)')
      .eq('ativa', true)
      .maybeSingle(),
    // Partes de arranjo que me incluem (dupla/trio) — válidas pela data do arranjo
    locals.supabase
      .from('arranjo_partes')
      .select('id, quadras_ids, locais_ids, publicadores, notas, arranjos!inner(id, nome, data, hora_inicio, local_endereco, dirigente_id, ativo)')
      .contains('publicadores', [locals.user!.id])
      .eq('arranjos.ativo', true)
      .or(`data.gte.${ontem},data.is.null`, { foreignTable: 'arranjos' })
      .order('criada_em', { ascending: false }),
    // Arranjos que EU dirijo (de ontem em diante — a saída de ontem à noite
    // ainda interessa de manhã) — card "Você dirige"
    locals.supabase
      .from('arranjos')
      .select('id, nome, data, hora_inicio, local_endereco, quadras_ids, cartas_locais_ids, tce_id')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${ontem},data.is.null`)
      .order('data', { nullsFirst: false })
      .limit(5),
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
    locals.supabase.from('publicacoes').select('id, nome, categoria, qtd_estoque, imagem_url').eq('ativo', true).order('categoria').order('nome'),
    // Necessidade regular de revistas (Despertai/Sentinela) — preferência informativa, sem status
    locals.supabase
      .from('publicador_necessidade_regular')
      .select('publicacao_id, qtd')
      .eq('publicador_id', locals.user!.id)
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

  // Cobertura pra barra de progresso nos cards do home: território pessoal
  // + quadras dos arranjos que dirijo + da minha parte (dupla/trio)
  const idsPartes = (partesRes.data ?? []).flatMap((p: any) => p.quadras_ids ?? []);
  const idsDirijo = (dirijoRes.data ?? []).flatMap((a: any) => a.quadras_ids ?? []);
  const idsCobertura = [...new Set([...abertas.flatMap((d) => d.quadras_ids), ...idsPartes, ...idsDirijo])];
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
  const minhasPartes = (partesRes.data ?? []).map((p: any) => ({
    id: p.id,
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

  // Arranjos que eu dirijo — card "Você dirige" com o território completo
  const arranjosQueDirijo = (dirijoRes.data ?? []).map((a: any) => ({
    id: a.id,
    nome: a.nome ?? 'Arranjo',
    data: a.data as string,
    hora_inicio: a.hora_inicio as string | null,
    local_endereco: a.local_endereco as string | null,
    quadras_ids: (a.quadras_ids ?? []) as string[],
    cartas_locais_ids: (a.cartas_locais_ids ?? []) as number[],
    tce_id: a.tce_id as string | null
  }));

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
      const [locDetalhes, unidsPorLocal] = await Promise.all([
        locals.supabase.from('locais').select('id, nome, logradouro, numero').in('id', localIds),
        locals.supabase.from('unidades').select('local_id, carta_entregue').in('local_id', localIds)
      ]);
      const stats: Record<number, { qtd: number; ent: number }> = {};
      for (const u of (unidsPorLocal.data ?? []) as any[]) {
        const s = (stats[u.local_id] ||= { qtd: 0, ent: 0 });
        s.qtd++;
        if (u.carta_entregue) s.ent++;
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
  // Card "Área do servo" só pro servo NÃO-admin — admin já acessa pelo drawer.
  const souServoPub = locals.profile?.role !== 'admin' && !!locals.profile?.servo_publicacoes;

  return {
    abertas,
    concluidas,
    quadrasMap: Object.fromEntries(quadrasMap),
    cobertura: Object.fromEntries(cobertura),
    tces,
    campanhaAtiva,
    minhasPartes,
    arranjosQueDirijo,
    cartasDesignadas,
    meusAgendamentosTp,
    meusPedidosPublicacao,
    catalogoPublicacoes,
    necessidadeRegular,
    souServoPub,
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
    const qtd = Number(fd.get('qtd') ?? 0);
    if (!publicacaoId) return fail(400, { erro: 'publicacao_id obrigatório' });
    if (qtd < 0) return fail(400, { erro: 'Quantidade inválida' });
    const { error } = await locals.supabase.from('publicador_necessidade_regular').upsert(
      { publicador_id: locals.user.id, publicacao_id: publicacaoId, qtd, atualizado_em: new Date().toISOString() },
      { onConflict: 'publicador_id,publicacao_id' }
    );
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Salvo' };
  }
};
