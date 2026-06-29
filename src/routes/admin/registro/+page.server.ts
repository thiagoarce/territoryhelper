import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const quadras = await listarQuadrasComGeo(locals.supabase);
  return { quadras };
};

export const actions: Actions = {
  // Marca N quadras como concluídas numa data
  marcarConcluidas: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    const data = String(fd.get('data') ?? '').trim() || new Date().toISOString().substring(0, 10);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'concluido', data_conclusao: data })
      .in('id', ids);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: `${ids.length} quadra(s) marcada(s) como concluída(s)` };
  },

  // Reverter para pendente
  reverter: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'pendente', data_conclusao: null })
      .in('id', ids);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: `${ids.length} revertida(s)` };
  },

  // Marca como inativa (parque, área verde — não conta na contagem)
  marcarInativa: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'inativa' })
      .in('id', ids);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: `${ids.length} marcada(s) como inativa(s)` };
  }
};
