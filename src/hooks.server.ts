import { createServerClient } from '@supabase/ssr';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Profile } from '$lib/types';

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

  // safeGetSession valida o JWT chamando getUser() (server-side) em vez de
  // confiar no payload do cookie (que o cliente poderia forjar).
  event.locals.safeGetSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };
    const {
      data: { user },
      error
    } = await event.locals.supabase.auth.getUser();
    if (error) return { session: null, user: null };
    return { session, user };
  };

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === 'content-range' || name === 'x-supabase-api-version';
    }
  });
};

// 2. Carrega o profile do usuário logado e injeta em locals.profile.
const profile: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession();
  event.locals.session = session;
  event.locals.user = user;
  event.locals.profile = null;

  if (user) {
    const { data } = await event.locals.supabase
      .from('profiles')
      .select('id, nome, role, ativo, criado_em')
      .eq('id', user.id)
      .single();
    if (data) event.locals.profile = data as Profile;
  }

  return resolve(event);
};

export const handle = sequence(supabase, profile);
