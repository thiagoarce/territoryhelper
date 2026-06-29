import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  return { quadras, designacoesAbertas: abertas };
};

export const actions: Actions = {
  // Marca quadra(s) como concluída numa data específica.
  // Também encerra designações cujas quadras estão TODAS concluídas.
  concluirQuadra: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const data = String(fd.get('data') ?? '').trim() || new Date().toISOString().substring(0, 10);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'concluido', data_conclusao: data })
      .eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Quadra concluída em ' + data };
  },

  // Desfaz conclusão: volta status pra pendente, limpa data
  desfazerConclusao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'pendente', data_conclusao: null })
      .eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Conclusão desfeita' };
  }
};
