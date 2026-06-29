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

    // 1. Atualiza quadras
    const { error: err } = await locals.supabase
      .from('quadras')
      .update({ status: 'concluido', data_conclusao: data })
      .in('id', ids);
    if (err) return fail(400, { erro: err.message });

    // 2. Loga no histórico (uma linha por quadra)
    const linhas = ids.map((qid) => ({
      quadra_id: qid,
      data_conclusao: data,
      marcado_por: locals.user!.id
    }));
    await locals.supabase.from('quadras_conclusoes').insert(linhas);

    // Fechar designações cujas quadras estão TODAS concluídas
    const { data: dqLinhas } = await locals.supabase
      .from('designacao_quadras')
      .select('designacao_id, quadra_id')
      .in('quadra_id', ids);
    const designacoesIds = [...new Set((dqLinhas ?? []).map((l) => l.designacao_id))];
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

  // Reverter agora restaura a PENÚLTIMA conclusão (se houver) em vez de zerar
  reverter: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const ids = fd.getAll('ids').map((v) => String(v)).filter(Boolean);
    if (ids.length === 0) return fail(400, { erro: 'Selecione ao menos 1 quadra' });

    for (const qid of ids) {
      // Pega as 2 conclusões mais recentes (descendente)
      const { data: hist } = await locals.supabase
        .from('quadras_conclusoes')
        .select('id, data_conclusao')
        .eq('quadra_id', qid)
        .order('data_conclusao', { ascending: false })
        .order('id', { ascending: false })
        .limit(2);

      if (hist && hist.length > 0) {
        // Remove a última (a atual)
        await locals.supabase.from('quadras_conclusoes').delete().eq('id', hist[0].id);
      }
      const penultima = hist?.[1]?.data_conclusao ?? null;
      // Se tem penúltima, restaura — senão volta pra pendente sem data
      await locals.supabase
        .from('quadras')
        .update({
          status: penultima ? 'concluido' : 'pendente',
          data_conclusao: penultima
        })
        .eq('id', qid);
    }

    return { ok: true, msg: `${ids.length} revertida(s)` };
  },

  // Histórico de conclusões de uma quadra (pro long-press / detalhe)
  historico: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { data, error } = await locals.supabase
      .from('quadras_conclusoes')
      .select('id, data_conclusao, marcado_em, marcado_por, profiles(nome)')
      .eq('quadra_id', id)
      .order('data_conclusao', { ascending: false })
      .order('id', { ascending: false })
      .limit(20);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, historico: data };
  }
};
