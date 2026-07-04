import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdmin } from '../_shared';

export interface TpCarrinhoTipo {
  id: number;
  nome: string;
  descricao: string | null;
  codigo: string | null;
  ativo: boolean;
}

export interface TpPecaCatalogo {
  id: number;
  tipo_id: number;
  nome: string;
  categoria: 'fisica' | 'literatura';
  publicacao_id: number | null;
  publicacao_nome: string | null;
  codigo: string | null;
  ordem: number;
  ativo: boolean;
}

export interface TpCarrinho {
  id: number;
  nome: string;
  tipo_id: number;
  tipo_nome: string;
  cor: string;
  guardado_em: string | null;
  custodia_id: string | null;
  custodia_nome: string | null;
  status: 'disponivel' | 'manutencao' | 'aposentado';
  notas: string | null;
}

export const load: PageServerLoad = async ({ locals }) => {
  const [tiposRes, pecasRes, carrinhosRes, publicadoresRes, publicacoesRes] = await Promise.all([
    locals.supabase.from('tp_carrinho_tipos').select('*').order('nome'),
    locals.supabase.from('tp_pecas_catalogo').select('*').order('tipo_id').order('ordem'),
    locals.supabase.from('tp_carrinhos').select('*').order('nome'),
    locals.supabase.from('profiles').select('id, nome').eq('ativo', true).order('nome'),
    locals.supabase.from('publicacoes').select('id, nome').eq('ativo', true).order('nome')
  ]);

  const tiposRows = (tiposRes.data ?? []) as TpCarrinhoTipo[];
  const nomeTipoPorId: Record<number, string> = {};
  for (const t of tiposRows) nomeTipoPorId[t.id] = t.nome;

  const publicadores = (publicadoresRes.data ?? []) as { id: string; nome: string }[];
  const nomePublicadorPorId: Record<string, string> = {};
  for (const p of publicadores) nomePublicadorPorId[p.id] = p.nome;

  const publicacoes = (publicacoesRes.data ?? []) as { id: number; nome: string }[];
  const nomePublicacaoPorId: Record<number, string> = {};
  for (const p of publicacoes) nomePublicacaoPorId[p.id] = p.nome;

  const pecas: TpPecaCatalogo[] = ((pecasRes.data ?? []) as any[]).map((p) => ({
    id: p.id,
    tipo_id: p.tipo_id,
    nome: p.nome,
    categoria: p.categoria,
    publicacao_id: p.publicacao_id,
    publicacao_nome: p.publicacao_id ? (nomePublicacaoPorId[p.publicacao_id] ?? null) : null,
    codigo: p.codigo,
    ordem: p.ordem,
    ativo: p.ativo
  }));

  const carrinhos: TpCarrinho[] = ((carrinhosRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo_id: c.tipo_id,
    tipo_nome: nomeTipoPorId[c.tipo_id] ?? '?',
    cor: c.cor,
    guardado_em: c.guardado_em,
    custodia_id: c.custodia_id,
    custodia_nome: c.custodia_id ? (nomePublicadorPorId[c.custodia_id] ?? null) : null,
    status: c.status,
    notas: c.notas
  }));

  return {
    carrinhoTipos: tiposRows,
    pecasCatalogo: pecas,
    carrinhos,
    publicadores,
    publicacoes
  };
};

export const actions: Actions = {
  criarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').insert({ nome, descricao, codigo });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Tipo criado' };
  },

  atualizarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').update({ nome, descricao, codigo, ativo }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Tipo atualizado' };
  },

  apagarTipo: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinho_tipos').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Tipo tem carrinho(s) vinculado(s) — mude o tipo deles primeiro ou apague-os.' });
    return { ok: true, msg: 'Tipo removido (peças do catálogo somem junto)' };
  },

  criarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const nome = String(fd.get('nome') ?? '').trim();
    const categoria = String(fd.get('categoria') ?? '').trim();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    const ordem = Number(fd.get('ordem') ?? 0) || 0;
    if (!tipoId) return fail(400, { erro: 'tipo_id obrigatório' });
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!['fisica', 'literatura'].includes(categoria)) return fail(400, { erro: 'Categoria inválida' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').insert({
      tipo_id: tipoId, nome, categoria,
      publicacao_id: categoria === 'literatura' ? publicacaoId : null,
      codigo, ordem
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça adicionada' };
  },

  atualizarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const categoria = String(fd.get('categoria') ?? '').trim();
    const publicacaoId = Number(fd.get('publicacao_id') ?? 0) || null;
    const codigo = String(fd.get('codigo') ?? '').trim() || null;
    const ordem = Number(fd.get('ordem') ?? 0) || 0;
    const ativo = fd.get('ativo') === 'on' || fd.get('ativo') === 'true';
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!['fisica', 'literatura'].includes(categoria)) return fail(400, { erro: 'Categoria inválida' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').update({
      nome, categoria,
      publicacao_id: categoria === 'literatura' ? publicacaoId : null,
      codigo, ordem, ativo
    }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça atualizada' };
  },

  apagarPeca: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_pecas_catalogo').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Peça removida' };
  },

  criarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const cor = String(fd.get('cor') ?? '').trim() || '#3b82f6';
    const guardadoEm = String(fd.get('guardado_em') ?? '').trim() || null;
    const custodiaId = String(fd.get('custodia_id') ?? '').trim() || null;
    const status = String(fd.get('status') ?? 'disponivel').trim();
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!tipoId) return fail(400, { erro: 'Tipo obrigatório' });
    if (!['disponivel', 'manutencao', 'aposentado'].includes(status)) return fail(400, { erro: 'Status inválido' });
    const { error } = await locals.supabase.from('tp_carrinhos').insert({
      nome, tipo_id: tipoId, cor, guardado_em: guardadoEm, custodia_id: custodiaId, status, notas
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Equipamento criado' };
  },

  atualizarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const nome = String(fd.get('nome') ?? '').trim();
    const tipoId = Number(fd.get('tipo_id') ?? 0);
    const cor = String(fd.get('cor') ?? '').trim() || '#3b82f6';
    const guardadoEm = String(fd.get('guardado_em') ?? '').trim() || null;
    const custodiaId = String(fd.get('custodia_id') ?? '').trim() || null;
    const status = String(fd.get('status') ?? 'disponivel').trim();
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    if (!tipoId) return fail(400, { erro: 'Tipo obrigatório' });
    if (!['disponivel', 'manutencao', 'aposentado'].includes(status)) return fail(400, { erro: 'Status inválido' });
    const { error } = await locals.supabase.from('tp_carrinhos').update({
      nome, tipo_id: tipoId, cor, guardado_em: guardadoEm, custodia_id: custodiaId, status, notas
    }).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Equipamento atualizado' };
  },

  apagarCarrinho: async ({ request, locals }) => {
    const guard = exigirAdmin(locals);
    if (guard) return guard;
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tp_carrinhos').delete().eq('id', id);
    if (error) return fail(400, { erro: 'Equipamento tem agendamento(s) vinculado(s) — arquive-o em vez de excluir.' });
    return { ok: true, msg: 'Equipamento removido' };
  }
};
