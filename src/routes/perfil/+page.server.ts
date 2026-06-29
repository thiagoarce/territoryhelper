import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.profile) throw redirect(303, '/login');
  return { profile: locals.profile, email: locals.user.email };
};

export const actions: Actions = {
  // Atualiza nome próprio (RLS permite via profiles_update_self)
  atualizarNome: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const nome = String(fd.get('nome') ?? '').trim();
    if (!nome) return fail(400, { erro: 'Nome obrigatório' });
    const { error } = await locals.supabase.from('profiles').update({ nome }).eq('id', locals.user.id);
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Nome atualizado' };
  },

  // Troca senha — usa auth.updateUser direto
  trocarSenha: async ({ request, locals }) => {
    if (!locals.user) return fail(401, { erro: 'Não autenticado' });
    const fd = await request.formData();
    const senha = String(fd.get('senha') ?? '');
    if (senha.length < 6) return fail(400, { erro: 'Senha precisa de 6+ caracteres' });
    const { error } = await locals.supabase.auth.updateUser({ password: senha });
    if (error) return fail(400, { erro: error.message });
    return { ok: true, msg: 'Senha trocada' };
  }
};
