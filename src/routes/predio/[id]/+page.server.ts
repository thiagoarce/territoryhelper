import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { carregarPredioDetalhado } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Faça login');
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) throw error(400, 'ID inválido');
  const predio = await carregarPredioDetalhado(locals.supabase, id);
  if (!predio) throw error(404, 'Prédio não encontrado');
  return { predio };
};

export const actions: Actions = {
  // Mesma semântica do RPC público carta_publica_toggle:
  // - carta_entregue é date → toggle grava current_date OU null
  // - desocupado / nao_escrever são boolean → inverte
  toggle: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const localId = Number(params.id);
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const campo = String(fd.get('campo') ?? '');
    if (!unidadeId || !['carta_entregue', 'desocupado', 'nao_escrever'].includes(campo)) {
      return fail(400, { erro: 'Parâmetros inválidos' });
    }

    // Confere que a unidade pertence a esse prédio (defesa em profundidade)
    const { data: u, error: errU } = await locals.supabase
      .from('unidades')
      .select('id, local_id, carta_entregue, desocupado, nao_escrever')
      .eq('id', unidadeId)
      .maybeSingle();
    if (errU || !u) return fail(404, { erro: 'Unidade não encontrada' });
    if (u.local_id !== localId) return fail(400, { erro: 'Unidade não pertence a este prédio' });

    const patch: Record<string, unknown> = {};
    if (campo === 'carta_entregue') {
      patch.carta_entregue = u.carta_entregue ? null : new Date().toISOString().slice(0, 10);
    } else if (campo === 'desocupado') {
      patch.desocupado = !u.desocupado;
    } else {
      patch.nao_escrever = !u.nao_escrever;
    }

    const { error: errUp } = await locals.supabase.from('unidades').update(patch).eq('id', unidadeId);
    if (errUp) return fail(400, { erro: errUp.message });
    return { ok: true };
  }
};
