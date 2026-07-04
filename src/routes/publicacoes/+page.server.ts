import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirServoPub } from '$lib/server/guards';

export interface PedidoLinha {
  id: number;
  publicador_id: string;
  publicador_nome: string;
  publicacao_id: number | null;
  publicacao_nome: string | null;
  descricao: string | null;
  qtd: number;
  status: 'aberto' | 'pedido' | 'entregue' | 'cancelado';
  notas_servo: string | null;
  criado_em: string;
}

export interface ReposicaoItem {
  id: number;
  peca_nome: string;
  categoria: 'fisica' | 'literatura';
  estado: 'acabando' | 'zerado' | 'danificado';
  qtd_colocada: number | null;
  obs: string | null;
  carrinho_nome: string;
  ponto_nome: string;
  data: string;
}

export interface TendenciaMes {
  mes: string;
  publicacao_nome: string;
  qtd: number;
}

const FILTROS_VALIDOS = ['pendentes', 'entregue', 'cancelado', 'todos'] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

export const load: PageServerLoad = async ({ locals, url }) => {
  exigirServoPub(locals);

  const filtroParam = url.searchParams.get('status') as Filtro | null;
  const filtro: Filtro = filtroParam && FILTROS_VALIDOS.includes(filtroParam) ? filtroParam : 'pendentes';

  let query = locals.supabase
    .from('pedidos_publicacao')
    .select('id, publicador_id, publicacao_id, descricao, qtd, status, notas_servo, criado_em, profiles!inner(nome), publicacoes(nome)');

  if (filtro === 'pendentes') query = query.in('status', ['aberto', 'pedido']).order('criado_em');
  else if (filtro === 'todos') query = query.order('criado_em', { ascending: false });
  else query = query.eq('status', filtro).order('criado_em', { ascending: false });

  const { data, error } = await query;
  if (error) {
    return {
      pedidos: [] as PedidoLinha[], filtro, souAdmin: locals.profile?.role === 'admin',
      reposicao: [] as ReposicaoItem[], tendencia: [] as TendenciaMes[], erro: error.message
    };
  }

  const pedidos: PedidoLinha[] = ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    publicador_id: p.publicador_id,
    publicador_nome: p.profiles?.nome ?? '?',
    publicacao_id: p.publicacao_id,
    publicacao_nome: p.publicacoes?.nome ?? null,
    descricao: p.descricao,
    qtd: p.qtd,
    status: p.status,
    notas_servo: p.notas_servo,
    criado_em: p.criado_em
  }));

  // TP-D — Reposição: itens de relatório ainda não resolvidos (estado != ok)
  const { data: reposicaoRows } = await locals.supabase
    .from('tp_relatorio_itens')
    .select(`
      id, estado, qtd_colocada, obs,
      tp_pecas_catalogo!inner(nome, categoria),
      tp_relatorios!inner(data, tp_agendamentos!inner(ponto_avulso, tp_carrinhos(nome), tp_pontos(nome)))
    `)
    .is('resolvido_em', null)
    .neq('estado', 'ok')
    .order('id');

  const reposicao: ReposicaoItem[] = ((reposicaoRows ?? []) as any[]).map((r) => ({
    id: r.id,
    peca_nome: r.tp_pecas_catalogo?.nome ?? '?',
    categoria: r.tp_pecas_catalogo?.categoria ?? 'fisica',
    estado: r.estado,
    qtd_colocada: r.qtd_colocada,
    obs: r.obs,
    carrinho_nome: r.tp_relatorios?.tp_agendamentos?.tp_carrinhos?.nome ?? '?',
    ponto_nome: r.tp_relatorios?.tp_agendamentos?.tp_pontos?.nome ?? r.tp_relatorios?.tp_agendamentos?.ponto_avulso ?? '?',
    data: r.tp_relatorios?.data ?? ''
  }));

  // Tendência simples: soma de qtd_colocada por publicação por mês (últimos 3 meses com dado)
  const { data: tendenciaRows } = await locals.supabase
    .from('tp_relatorio_itens')
    .select('qtd_colocada, tp_pecas_catalogo!inner(publicacao_id, publicacoes(nome)), tp_relatorios!inner(data)')
    .not('qtd_colocada', 'is', null);

  const somaPorMesPublicacao = new Map<string, number>();
  for (const r of (tendenciaRows ?? []) as any[]) {
    const pubNome = r.tp_pecas_catalogo?.publicacoes?.nome;
    if (!pubNome) continue;
    const mes = String(r.tp_relatorios?.data ?? '').substring(0, 7);
    if (!mes) continue;
    const chave = mes + '|' + pubNome;
    somaPorMesPublicacao.set(chave, (somaPorMesPublicacao.get(chave) ?? 0) + (r.qtd_colocada ?? 0));
  }
  const tendencia: TendenciaMes[] = [...somaPorMesPublicacao.entries()]
    .map(([chave, qtd]) => {
      const [mes, publicacao_nome] = chave.split('|');
      return { mes, publicacao_nome, qtd };
    })
    .sort((a, b) => (a.mes < b.mes ? 1 : a.mes > b.mes ? -1 : 0))
    .slice(0, 12);

  return { pedidos, filtro, souAdmin: locals.profile?.role === 'admin', reposicao, tendencia };
};

export const actions: Actions = {
  atualizarPedido: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });

    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    const status = fd.get('status');
    if (status) {
      if (!['aberto', 'pedido', 'entregue', 'cancelado'].includes(String(status))) {
        return fail(400, { erro: 'Status inválido' });
      }
      patch.status = status;
    }
    const notasEnviadas = fd.has('notas_servo');
    if (notasEnviadas) patch.notas_servo = String(fd.get('notas_servo') ?? '').trim() || null;

    const { error } = await locals.supabase.from('pedidos_publicacao').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Pedido atualizado' };
  },

  resolverReposicao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (locals.profile?.role !== 'admin' && !locals.profile?.servo_publicacoes) {
      return fail(403, { erro: 'Só o servo de publicações' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('tp_relatorio_itens')
      .update({ resolvido_em: new Date().toISOString(), resolvido_por: locals.user.id })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Marcado como resolvido' };
  }
};
