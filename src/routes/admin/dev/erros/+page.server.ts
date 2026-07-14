import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { exigirAdminAction } from '$lib/server/guards';

export interface ErroClienteLinha {
  id: number;
  publicador_id: string | null;
  publicador_nome: string | null;
  mensagem: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  criado_em: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.profile?.role !== 'admin') return { erros: [] };

  // Bounded (não selectAll) — isto é debug, não precisa do histórico
  // inteiro; um erros_client grande não pode virar custo de CPU do
  // Worker toda vez que o admin abre a tela.
  const [errosRes, profRes] = await Promise.all([
    locals.supabase
      .from('erros_client')
      .select('id, publicador_id, mensagem, stack, url, user_agent, criado_em')
      .order('criado_em', { ascending: false })
      .limit(300),
    locals.supabase.from('profiles').select('id, nome')
  ]);
  const nomePorId = new Map((profRes.data ?? []).map((p) => [p.id, p.nome]));

  const erros: ErroClienteLinha[] = ((errosRes.data ?? []) as any[]).map((e) => ({
    ...e,
    publicador_nome: e.publicador_id ? nomePorId.get(e.publicador_id) ?? null : null
  }));

  return { erros };
};

export const actions: Actions = {
  limparTodos: async ({ locals }) => {
    const guard = exigirAdminAction(locals);
    if (guard) return guard;
    const { error } = await locals.supabase.from('erros_client').delete().gt('id', 0);
    if (error) return fail(400, { erro: error.message });
    return { ok: true };
  }
};
