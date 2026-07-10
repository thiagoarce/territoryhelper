// W9: load foi pro +page.ts (universal, browser). Aqui só ficam as
// actions — mutações continuam no Worker por defesa em profundidade.
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  criarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const campanhaId = Number(fd.get('campanha_id') ?? 0);
    const texto = String(fd.get('texto') ?? '').trim();
    if (!campanhaId || !texto) return fail(400, { erro: 'Descreva a meta' });
    const { error } = await locals.supabase.from('campanha_metas_pessoais').insert({
      campanha_id: campanhaId, publicador_id: locals.user.id, texto
    });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Meta adicionada' };
  },

  marcarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const feito = fd.get('feito') === 'true';
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('campanha_metas_pessoais')
      .update({ feito })
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true };
  },

  apagarMetaPessoal: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase
      .from('campanha_metas_pessoais')
      .delete()
      .eq('id', id)
      .eq('publicador_id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Meta removida' };
  }
};
