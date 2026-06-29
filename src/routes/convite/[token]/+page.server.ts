import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const load: PageServerLoad = async ({ params }) => {
  const { data: convite } = await supabaseAdmin
    .from('convites')
    .select('id, email, nome, role, expira_em, usado_em')
    .eq('token', params.token)
    .maybeSingle();
  if (!convite) return { erro: 'Convite não encontrado' };
  if (convite.usado_em) return { erro: 'Convite já foi usado' };
  if (convite.expira_em && new Date(convite.expira_em) < new Date()) {
    return { erro: 'Convite expirado' };
  }
  return { convite };
};

export const actions: Actions = {
  default: async ({ request, params, locals }) => {
    const fd = await request.formData();
    const senha = String(fd.get('senha') ?? '');
    if (senha.length < 6) return fail(400, { erro: 'Senha precisa de 6+ caracteres' });

    const { data: convite, error: errC } = await supabaseAdmin
      .from('convites')
      .select('id, email, nome, role, expira_em, usado_em')
      .eq('token', params.token)
      .maybeSingle();
    if (errC || !convite) return fail(400, { erro: 'Convite inválido' });
    if (convite.usado_em) return fail(400, { erro: 'Convite já usado' });

    // Cria usuário
    const { data: user, error: errU } = await supabaseAdmin.auth.admin.createUser({
      email: convite.email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: convite.nome }
    });
    if (errU) return fail(400, { erro: errU.message });

    // Atualiza profile
    await supabaseAdmin.from('profiles').upsert({
      id: user.user.id,
      nome: convite.nome,
      role: convite.role,
      ativo: true
    });

    // Marca convite como usado
    await supabaseAdmin
      .from('convites')
      .update({ usado_em: new Date().toISOString(), usado_por: user.user.id })
      .eq('id', convite.id);

    // Login automático
    await locals.supabase.auth.signInWithPassword({ email: convite.email, password: senha });
    throw redirect(303, '/');
  }
};
