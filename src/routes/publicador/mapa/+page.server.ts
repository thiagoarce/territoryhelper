import type { Actions, PageServerLoad } from './$types';
import { fail, error } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes } from '$lib/server/queries';

// Mapa estratégico do dirigente — parte do modo campo (specs.md revisado).
// Só role dirigente/admin acessa. Publicador puro é bloqueado.
export const load: PageServerLoad = async ({ locals }) => {
  if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
    throw error(403, 'Só dirigente/admin acessa o mapa estratégico');
  }
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  return { quadras, designacoesAbertas: abertas };
};

export const actions: Actions = {
  concluirQuadra: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    const data = String(fd.get('data') ?? '').trim() || new Date().toISOString().substring(0, 10);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase
      .from('quadras').update({ data_conclusao: data }).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Quadra concluída em ' + data };
  },

  desfazerConclusao: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error: err } = await locals.supabase
      .from('quadras').update({ data_conclusao: null }).eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Conclusão desfeita' };
  }
};
