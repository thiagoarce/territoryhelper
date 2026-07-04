import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const load: PageServerLoad = async ({ params }) => {
  const { data: convite } = await supabaseAdmin
    .from('convites')
    .select('id, email, nome, role, publicador_id, expira_em, usado_em')
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
      .select('id, email, nome, role, publicador_id, expira_em, usado_em')
      .eq('token', params.token)
      .maybeSingle();
    if (errC || !convite) return fail(400, { erro: 'Convite inválido' });
    if (convite.usado_em) return fail(400, { erro: 'Convite já usado' });

    // O publicador (auth.users + profile) já existe desde a criação do
    // convite (provisório, com senha descartável) — só falta ele definir
    // a própria senha e confirmar o email.
    if (!convite.publicador_id) return fail(400, { erro: 'Convite antigo sem publicador vinculado — peça um novo convite' });
    const { error: errU } = await supabaseAdmin.auth.admin.updateUserById(convite.publicador_id, {
      password: senha,
      email_confirm: true
    });
    if (errU) return fail(400, { erro: errU.message });

    // Marca convite como usado
    await supabaseAdmin
      .from('convites')
      .update({ usado_em: new Date().toISOString(), usado_por: convite.publicador_id })
      .eq('id', convite.id);

    // Login automático
    await locals.supabase.auth.signInWithPassword({ email: convite.email, password: senha });
    throw redirect(303, '/');
  }
};
