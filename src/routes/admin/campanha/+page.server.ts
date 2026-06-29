import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import type { Campanha } from '$lib/types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data, error } = await locals.supabase
    .from('campanha')
    .select('*')
    .order('modalidade')
    .order('ordem');
  if (error) throw error;
  return { objetivos: (data ?? []) as Campanha[] };
};

const MODALIDADES = ['casa', 'comercial', 'rural', 'cartas', 'telefone', 'publico'] as const;
const TIPOS = ['geral', 'semana'] as const;

export const actions: Actions = {
  criar: async ({ request, locals }) => {
    const fd = await request.formData();
    const tipo = String(fd.get('tipo') ?? '');
    const modalidade = String(fd.get('modalidade') ?? '');
    const titulo = String(fd.get('titulo') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const link = String(fd.get('link') ?? '').trim() || null;
    const publico = fd.get('publico') === 'on';
    if (!TIPOS.includes(tipo as any)) return fail(400, { erro: 'Tipo inválido' });
    if (!MODALIDADES.includes(modalidade as any)) return fail(400, { erro: 'Modalidade inválida' });
    if (!titulo) return fail(400, { erro: 'Título obrigatório' });
    const { error } = await locals.supabase
      .from('campanha')
      .insert({ tipo, modalidade, titulo, descricao, link, publico });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Objetivo criado' };
  },

  atualizar: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    const titulo = String(fd.get('titulo') ?? '').trim();
    const descricao = String(fd.get('descricao') ?? '').trim() || null;
    const link = String(fd.get('link') ?? '').trim() || null;
    const publico = fd.get('publico') === 'on';
    if (!id || !titulo) return fail(400, { erro: 'id e título obrigatórios' });
    const { error } = await locals.supabase
      .from('campanha')
      .update({ titulo, descricao, link, publico })
      .eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Atualizado' };
  },

  excluir: async ({ request, locals }) => {
    const fd = await request.formData();
    const id = Number(fd.get('id') ?? 0);
    if (!id) return fail(400, { erro: 'id obrigatório' });
    const { error } = await locals.supabase.from('campanha').delete().eq('id', id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Excluído' };
  }
};
