// W8: o LOAD desta rota mora em +page.ts (universal, browser, com
// cache offline — modo rua). Este arquivo fica só com as ACTIONS.
import type { Actions } from './$types';
import { hojeIsoBrasil } from '$lib/utils/data';
import { fail } from '@sveltejs/kit';

const DESFECHOS_VALIDOS = ['conversou', 'semConversa', 'naoAtendeu', ''] as const;

// Defesa em profundidade: valida que o TCE é visível pro usuário (RLS só
// mostra TCE designado a ele, ou tudo pra admin/dirigente) e que a unidade
// pertence a ESSE TCE — sem isso um POST direto registra desfecho em
// unidade de outro território.
async function podeTrabalharUnidadeDoTce(locals: App.Locals, tceId: string, unidadeId: number): Promise<boolean> {
  const [tceRes, vincRes] = await Promise.all([
    locals.supabase.from('tces').select('id').eq('id', tceId).maybeSingle(),
    locals.supabase.from('tce_unidades').select('unidade_id').eq('tce_id', tceId).eq('unidade_id', unidadeId).maybeSingle()
  ]);
  return !!tceRes.data && !!vincRes.data;
}

export const actions: Actions = {
  marcarDesfecho: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const tipo = String(fd.get('tipo') ?? '');
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!DESFECHOS_VALIDOS.includes(tipo as any)) return fail(400, { erro: 'tipo inválido' });
    if (!(await podeTrabalharUnidadeDoTce(locals, params.id, unidadeId))) {
      return fail(403, { erro: 'Unidade fora do seu TCE' });
    }
    const tipoFinal = tipo === '' ? 'desfeito' : tipo;
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({ unidade_id: unidadeId, tipo: tipoFinal, publicador_id: locals.user.id });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  toggleCarta: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const undo = fd.get('undo') === 'true';
    if (!unidadeId) return fail(400, { erro: 'unidade_id obrigatório' });
    if (!(await podeTrabalharUnidadeDoTce(locals, params.id, unidadeId))) {
      return fail(403, { erro: 'Unidade fora do seu TCE' });
    }
    const { error: err } = await locals.supabase
      .from('registros')
      .insert({ unidade_id: unidadeId, tipo: undo ? 'carta_undo' : 'carta', publicador_id: locals.user.id });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  },

  concluir: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '');
    if (!id) return fail(400, { erro: 'id obrigatório' });
    if (id !== params.id) return fail(400, { erro: 'id não bate com a rota' });
    const { data: tceVisivel } = await locals.supabase.from('tces').select('id').eq('id', id).maybeSingle();
    if (!tceVisivel) return fail(403, { erro: 'TCE não é seu' });
    const { error: err } = await locals.supabase
      .from('tces')
      .update({ status: 'concluido', data_conclusao: hojeIsoBrasil() })
      .eq('id', id);
    if (err) return fail(400, { erro: err.message });
    return { ok: true, msg: 'TCE concluído' };
  }
};
