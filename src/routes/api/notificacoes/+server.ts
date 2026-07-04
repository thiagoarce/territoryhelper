// Fonte de dados do sino (in-app) E do service worker (push "tickle" sem
// payload busca aqui pra saber o que mostrar). Autenticado por cookie de
// sessão (mesma origem) — RLS de `notificacoes` já filtra pro próprio usuário.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return json({ notificacoes: [] }, { status: 401 });

  let query = locals.supabase
    .from('notificacoes')
    .select('id, titulo, corpo, url, lida_em, criado_em')
    .order('criado_em', { ascending: false })
    .limit(30);
  if (url.searchParams.get('nao_lidas') === '1') query = query.is('lida_em', null);

  const { data, error } = await query;
  if (error) return json({ notificacoes: [], erro: error.message }, { status: 400 });
  return json({ notificacoes: data ?? [] });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ erro: 'Não autenticado' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const agora = new Date().toISOString();

  if (body.marcarTodas) {
    const { error } = await locals.supabase
      .from('notificacoes')
      .update({ lida_em: agora })
      .is('lida_em', null);
    if (error) return json({ erro: error.message }, { status: 400 });
    return json({ ok: true });
  }

  const id = Number(body.id ?? 0);
  if (!id) return json({ erro: 'id obrigatório' }, { status: 400 });
  const { error } = await locals.supabase.from('notificacoes').update({ lida_em: agora }).eq('id', id);
  if (error) return json({ erro: error.message }, { status: 400 });
  return json({ ok: true });
};
