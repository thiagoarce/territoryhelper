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
  if (error) return { pedidos: [] as PedidoLinha[], filtro, souAdmin: locals.profile?.role === 'admin', erro: error.message };

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

  return { pedidos, filtro, souAdmin: locals.profile?.role === 'admin' };
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
  }
};
