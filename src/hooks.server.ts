import { createServerClient } from '@supabase/ssr';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Profile } from '$lib/types';
import { talvezRodarLembretesDiarios } from '$lib/server/lembretes';

// 1. Cria client Supabase com cookies da sessão. Anexa em event.locals.
const supabase: Handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' });
        });
      }
    }
  });

  // safeGetSession: pega a sessão do cookie. Tenta validar via getUser() pra
  // garantir que o JWT não foi forjado, mas se a chamada falhar (problema
  // de rede em Workers, latência alta, etc) cai pra session.user em vez de
  // retornar null — senão o user fica preso num loop /login → / → /login.
  event.locals.safeGetSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };
    try {
      const {
        data: { user },
        error
      } = await event.locals.supabase.auth.getUser();
      if (error) {
        console.error('[safeGetSession] getUser error:', error.message);
        return { session, user: session.user };
      }
      return { session, user };
    } catch (e) {
      console.error('[safeGetSession] getUser threw:', e);
      return { session, user: session.user };
    }
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });
};

// 2. Carrega o profile do usuário logado e injeta em locals.profile.
// Loga erros pra ficar visível na Observability do Cloudflare se algo
// der errado (RLS bloqueando, profile inexistente, etc).
const profile: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession();
  event.locals.session = session;
  event.locals.user = user;
  event.locals.profile = null;

  if (user) {
    const { data, error } = await event.locals.supabase
      .from('profiles')
      .select('id, nome, role, ativo, servo_publicacoes, pref_basemap, tp_aprovado, criado_em, atualizado_em')
      .eq('id', user.id)
      .single();
    if (error) {
      console.error('[profile load] error for user', user.id, ':', error.message);
    } else if (data) {
      event.locals.profile = data as Profile;
    } else {
      console.warn('[profile load] user', user.id, 'has no profile row');
    }
  }

  return resolve(event);
};

// 3. "Cron preguiçoso" (ver migration 086/lembretes.ts pra motivação):
// piggyback no primeiro request admin do dia, nunca atrasa a resposta
// (waitUntil roda depois do response ir pro cliente). Não é um request
// de admin de verdade toda vez — job_execucoes garante que só executa
// a lógica pesada uma vez por dia, o resto é 1 SELECT rápido.
const lembretesDiarios: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/admin') && event.locals.profile?.role === 'admin') {
    const ctx = (event.platform as any)?.context;
    const rodar = talvezRodarLembretesDiarios();
    if (ctx?.waitUntil) ctx.waitUntil(rodar);
    else rodar.catch(() => {});
  }
  return resolve(event);
};

export const handle = sequence(supabase, profile, lembretesDiarios);
