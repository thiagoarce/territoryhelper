import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // Já logado? Manda pra home (que redireciona pela role).
  if (locals.session && locals.profile) throw redirect(303, '/');
  return { msg: url.searchParams.get('msg') };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim();
    const senha = String(data.get('senha') ?? '');

    if (!email || !senha) {
      return fail(400, { email, erro: 'Preencha email e senha' });
    }

    const { error } = await locals.supabase.auth.signInWithPassword({ email, password: senha });
    if (error) {
      return fail(400, { email, erro: 'Email ou senha incorretos' });
    }

    throw redirect(303, '/');
  }
};
