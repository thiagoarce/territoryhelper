import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals }) => {
  const [quadras, designacoes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase)
  ]);
  const alocadas = new Set<string>();
  for (const d of designacoes) {
    if (d.status === 'aberta') for (const q of d.quadras_ids) alocadas.add(q);
  }
  return { quadras, quadrasAlocadas: [...alocadas] };
};

export const actions: Actions = {
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

    // Fechar designações cujas quadras estão TODAS concluídas
    const { data: linhas } = await locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, quadra_id')
      .in('quadra_id', ids);
    const designacoesIds = [...new Set((linhas ?? []).map((l) => l.designacao_id))];
    for (const dId of designacoesIds) {
      const { data: todasLinhas } = await locals.supabase
        .from('designacao_quadras')
        .select('quadra_id, quadras(status)')
        .eq('designacao_id', dId);
      const todasConcluidas = (todasLinhas ?? []).every((l: any) => l.quadras?.status === 'concluido');
      if (todasConcluidas && (todasLinhas?.length ?? 0) > 0) {
        await locals.supabase.from('designacoes').update({ status: 'concluida' }).eq('id', dId);
      }
    }

    return { ok: true, msg: `${ids.length} quadra(s) marcada(s) como concluída(s)` };
  },

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
  }
};
