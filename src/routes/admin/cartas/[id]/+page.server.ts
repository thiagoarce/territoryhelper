import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { carregarPredioDetalhado } from '$lib/server/queries';

export const load: PageServerLoad = async ({ locals, params }) => {
  const predio = await carregarPredioDetalhado(locals.supabase, Number(params.id));
  if (!predio) throw error(404, 'Prédio não encontrado');
  return { predio };
};

export const actions: Actions = {
  // Marca/desmarca um dos 4 toggles per-unidade pra cartas
  toggleApto: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const campo = String(fd.get('campo') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (!['carta_entregue', 'desocupado', 'nao_escrever'].includes(campo)) {
      return fail(400, { erro: 'campo inválido' });
    }

    // Pega valor atual pra inverter
    const { data: atual } = await locals.supabase
      .from('unidades')
      .select(campo)
      .eq('id', id)
      .single();
    const atualVal: any = (atual as any)?.[campo];
    const novo = campo === 'carta_entregue'
      ? (atualVal ? null : new Date().toISOString().substring(0, 10))
      : !atualVal;

    const patch: any = { [campo]: novo };
    const { error: err } = await locals.supabase.from('unidades').update(patch).eq('id', id);
    if (err) return fail(400, { erro: err.message });

    // Trilha em registros pra carta_entregue
    if (campo === 'carta_entregue') {
      await locals.supabase.from('registros').insert({
        unidade_id: id,
        tipo: novo ? 'carta' : 'carta_undo',
        publicador_id: locals.user.id
      });
    }

    return { ok: true };
  }
};
