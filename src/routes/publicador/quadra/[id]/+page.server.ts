import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { carregarQuadraComLocais } from '$lib/server/queries';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
  const dados = await carregarQuadraComLocais(locals.supabase, params.id);
  if (!dados) throw error(404, 'Quadra não encontrada');
  return dados;
};

export const actions: Actions = {
  // Marca desfecho mutex (naoAtendeu | semConversa | conversou) numa unidade.
  // Tipo vazio = "desfeito" (undo). Insere row em registros (append-only).
  marcarDesfecho: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) {
      return fail(400, { erro: 'tipo inválido' });
    }
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: tipoFinal,
        publicador_id: locals.user.id
      });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  // Marca/desmarca carta entregue. Atualiza unidades.carta_entregue (date)
  // E insere em registros pra trilha histórica.
  toggleCarta: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const marcar = fd.get('marcar') === 'true';
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });

    const hoje = new Date().toISOString().substring(0, 10);
    const { error: errUpd } = await locals.supabase
      .from('unidades')
      .update({ carta_entregue: marcar ? hoje : null })
      .eq('id', unidadeId);
    if (errUpd) return fail(400, { erro: errUpd.message });

    const { error: errReg } = await locals.supabase
      .from('registros')
      .insert({
        unidade_id: unidadeId,
        tipo: marcar ? 'carta' : 'carta_undo',
        publicador_id: locals.user.id
      });
    if (errReg) return fail(400, { erro: errReg.message });

    return { ok: true };
  }
};
