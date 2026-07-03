import type { Actions, PageServerLoad } from './$types';
import { fail, error } from '@sveltejs/kit';
import { listarQuadrasComGeo, listarDesignacoes, listarPublicadores } from '$lib/server/queries';

// Mapa estratégico do dirigente — parte do modo campo (specs.md revisado).
// Só role dirigente/admin acessa. Publicador puro é bloqueado.
export const load: PageServerLoad = async ({ locals }) => {
  if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
    throw error(403, 'Só dirigente/admin acessa o mapa estratégico');
  }
  const hoje = new Date().toISOString().substring(0, 10);

  const [quadras, designacoes, publicadores, dirijoRes] = await Promise.all([
    listarQuadrasComGeo(locals.supabase),
    listarDesignacoes(locals.supabase),
    listarPublicadores(locals.supabase),
    // Arranjos que EU dirijo (hoje em diante) — alvo do repartir via mapa
    locals.supabase
      .from('arranjos')
      .select('id, nome, data, quadras_ids, cartas_locais_ids')
      .eq('ativo', true)
      .eq('dirigente_id', locals.user!.id)
      .or(`data.gte.${hoje},data.is.null`)
      .order('data', { nullsFirst: false })
  ]);
  const abertas = designacoes.filter((d) => d.status === 'aberta');

  const meusArranjos = (dirijoRes.data ?? []) as {
    id: number; nome: string | null; data: string;
    quadras_ids: string[] | null; cartas_locais_ids: number[] | null;
  }[];

  // Partes dos meus arranjos (pra listar embaixo do mapa)
  let partes: { id: number; arranjo_id: number; quadras_ids: string[]; locais_ids: number[]; publicadores: string[] }[] = [];
  if (meusArranjos.length > 0) {
    const { data: pt } = await locals.supabase
      .from('arranjo_partes')
      .select('id, arranjo_id, quadras_ids, locais_ids, publicadores')
      .in('arranjo_id', meusArranjos.map((a) => a.id))
      .order('criada_em');
    partes = (pt ?? []) as any[];
  }

  return {
    quadras,
    designacoesAbertas: abertas,
    publicadores,
    meusArranjos,
    partes,
    minhaId: locals.user!.id
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

  // Reparte quadras de UM DOS MEUS arranjos pra 1+ publicadores (mesma parte).
  // Repartição só existe dentro de arranjo — delegação avulsa morreu.
  criarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const arranjoId = Number(fd.get('arranjo_id') ?? 0);
    const publicadorIds = fd.getAll('publicador_ids').map((v) => String(v)).filter(Boolean);
    const quadrasIds = fd.getAll('quadras_ids').map((v) => String(v)).filter(Boolean);
    const notas = String(fd.get('notas') ?? '').trim() || null;
    if (!arranjoId) return fail(400, { erro: 'Escolha o arranjo' });
    if (publicadorIds.length === 0) return fail(400, { erro: 'Selecione ao menos um publicador' });
    if (quadrasIds.length === 0) return fail(400, { erro: 'Escolha ao menos uma quadra' });

    const ehAdmin = locals.profile?.role === 'admin';
    const { data: arr } = await locals.supabase
      .from('arranjos').select('id, quadras_ids, dirigente_id').eq('id', arranjoId).single();
    if (!arr) return fail(404, { erro: 'Arranjo não encontrado' });
    if (!ehAdmin && arr.dirigente_id !== locals.user.id) {
      return fail(403, { erro: 'Você não é o dirigente desse arranjo' });
    }
    const quadrasArr = new Set((arr.quadras_ids ?? []) as string[]);
    const fora = quadrasIds.filter((q) => !quadrasArr.has(q));
    if (fora.length > 0) {
      return fail(400, { erro: `Quadra(s) ${fora.join(', ')} não está(ão) no território do arranjo. Anexe primeiro em /admin/arranjos ou na Visão Geral.` });
    }

    const { error: err } = await locals.supabase.from('arranjo_partes').insert({
      arranjo_id: arranjoId,
      quadras_ids: quadrasIds,
      locais_ids: [],
      publicadores: publicadorIds,
      notas,
      criado_por: locals.user.id
    });
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: `Parte criada (${quadrasIds.length} quadras → ${publicadorIds.length} publicador(es))` };
  },

  apagarParte: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    if (!['dirigente', 'admin'].includes(locals.profile?.role ?? '')) {
      return fail(403, { erro: 'Só dirigente/admin' });
    }
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (locals.profile?.role !== 'admin') {
      const { data: pt } = await locals.supabase
        .from('arranjo_partes')
        .select('id, arranjos!inner(dirigente_id)')
        .eq('id', id)
        .maybeSingle();
      if (!pt || (pt as any).arranjos?.dirigente_id !== locals.user.id) {
        return fail(403, { erro: 'Essa parte não é de um arranjo seu' });
      }
    }
    const { error: err } = await locals.supabase.from('arranjo_partes').delete().eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'Parte removida' };
  }
};
