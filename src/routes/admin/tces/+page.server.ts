import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarPublicadores } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [tcesRes, juncRes, publicadores] = await Promise.all([
    locals.supabase.from('tces').select('*').order('criado_em', { ascending: false }),
    locals.supabase.from('tce_unidades').select('tce_id, unidade_id'),
    listarPublicadores(locals.supabase)
  ]);
  if (tcesRes.error) throw tcesRes.error;
  if (juncRes.error) throw juncRes.error;

  const uniPorTce = new Map<string, number[]>();
  for (const j of juncRes.data ?? []) {
    const arr = uniPorTce.get(j.tce_id) ?? [];
    arr.push(j.unidade_id);
    uniPorTce.set(j.tce_id, arr);
  }
  const tces = (tcesRes.data ?? []).map((t: any) => ({
    ...t,
    qtd_unidades: uniPorTce.get(t.id)?.length ?? 0,
    unidade_ids: uniPorTce.get(t.id) ?? []
  }));

  return { tces, publicadores };
};

export const actions: Actions = {
  // Cria TCE com nome + publicador + lista de unidades (rows do CSV antigo
  // ou IDs novos). Sem convex hull automático por ora — admin desenha
  // polígono em rodada futura ou edita no DB.
  criar: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '').trim() || ('tce_' + Math.random().toString(36).substring(2, 10));
    const nome = String(fd.get('nome') ?? '').trim();
    const publicador_id = String(fd.get('publicador_id') ?? '').trim() || null;
    const prazo = String(fd.get('prazo') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    const unidadesIdsTxt = String(fd.get('unidades_ids') ?? '').trim();
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const unidadesIds = unidadesIdsTxt
      .split(/[,\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => !isNaN(n) && n > 0);

    const { error: e1 } = await locals.supabase.from('tces').insert({
      id, nome, tipo: 'comercial', publicador_id, prazo, notas, status: 'aberto'
    });
    if (e1) return fail(400, { erro: e1.message });

    if (unidadesIds.length > 0) {
      const links = unidadesIds.map((uid) => ({ tce_id: id, unidade_id: uid }));
      await locals.supabase.from('tce_unidades').insert(links);
    }
    return { ok: true, msg: `TCE criado com ${unidadesIds.length} unidade(s)` };
  },

  mudarStatus: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const status = String(fd.get('status') ?? '');
    if (!id || !['aberto', 'concluido', 'cancelado'].includes(status)) {
      return fail(400, { erro: 'Parâmetros inválidos' });
    }
    const patch: any = { status };
    if (status === 'concluido') patch.data_conclusao = new Date().toISOString().substring(0, 10);
    const { error } = await locals.supabase.from('tces').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Status atualizado' };
  },

  excluir: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('tces').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Excluído' };
  }
};
