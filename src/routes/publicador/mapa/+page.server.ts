import type { Actions, PageServerLoad } from './$types';
import { fail, error } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes, listarPublicadores } from '$lib/server/queries';

// Mapa estratégico do dirigente — parte do modo campo (specs.md revisado).
// Só role dirigente/admin acessa. Publicador puro é bloqueado.
export const load: PageServerLoad = async ({ locals }) => {
  if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
    throw error(403, 'Só dirigente/admin acessa o mapa estratégico');
  }
  const [quadras, designacoes, publicadores, delegRes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    locals.supabase
      .from('delegacoes_temp')
      .select('id, publicador_id, quadras_ids, data_fim')
      .eq('dirigente_id', locals.user!.id)
      .gt('data_fim', new Date().toISOString())
      .order('criada_em', { ascending: false })
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');
  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    delegacoesTemp: (delegRes.data ?? []) as { id: number; publicador_id: string; quadras_ids: string[]; data_fim: string }[]
  };
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
  },

  // Delega temporariamente subconjunto de quadras pra um publicador.
  // Expira sozinho no fim do dia (default) ou no prazo escolhido.
  delegarTemp: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const publicadorId = String(fd.get('publicador_id') ?? '').trim();
    const quadras = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const dataFim = String(fd.get('data_fim') ?? '').trim() || null;
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!publicadorId) return fail(400, { erro: 'Publicador obrigatório' });
    if (quadras.length === 0) return fail(400, { erro: 'Escolha ao menos uma quadra' });

    const patch: any = { dirigente_id: locals.user.id, publicador_id: publicadorId, quadras_ids: quadras, notas };
    if (dataFim) patch.data_fim = dataFim;
    const { error: err } = await locals.supabase.from('delegacoes_temp').insert(patch);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: `Delegado ${quadras.length} quadra(s)` };
  },

  encerrarDelegacaoTemp: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    // seta data_fim = agora pra "encerrar" (RLS já garante dirigente/admin)
    const { error: err } = await locals.supabase
      .from('delegacoes_temp')
      .update({ data_fim: new Date().toISOString() })
      .eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Delegação encerrada' };
  }
};
