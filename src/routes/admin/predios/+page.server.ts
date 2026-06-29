import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarPredios, carregarPredioDetalhado } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const predios = await listarPredios(locals.supabase);
  return { predios };
};

export const actions: Actions = {
  // Carrega detalhes de UM prédio (pro modal inline)
  detalhe: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const p = await carregarPredioDetalhado(locals.supabase, id);
    if (!p) return fail(404, { erro: 'Prédio não encontrado' });
    return { ok: true, predio: p };
  },

  atualizar: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const permitidos = ['nome', 'irmao_mora', 'nome_irmao', 'notas', 'tipo_entrada', 'acesso_caixas', 'acesso_interfones', 'nao_visitar'];
    const patch: Record<string, unknown> = {};
    for (const k of permitidos) {
      if (!fd.has(k)) continue;
      const v = fd.get(k);
      if (k === 'irmao_mora' || k === 'acesso_caixas' || k === 'acesso_interfones' || k === 'nao_visitar') {
        patch[k] = v === 'on' || v === 'true';
      } else {
        const s = String(v ?? '').trim();
        patch[k] = s === '' ? null : s;
      }
    }
    const { error } = await locals.supabase.from('locais').update(patch).eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Atualizado' };
  },

  gerarLink: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { data, error } = await locals.supabase
      .from('cartas_tokens')
      .insert({ local_id: id, criado_por: locals.user.id })
      .select('token')
      .single();
    if (error) return fail(400, { erro: error.message });
    return { ok: true, token: data.token };
  }
};
