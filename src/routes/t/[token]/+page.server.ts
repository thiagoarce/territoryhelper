import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Rota PÚBLICA — link de território (arranjo ou designação pessoal) pra
// mandar por WhatsApp pra quem não consegue abrir o app. Read-only.
// Dados vêm da RPC territorio_publico (security definer — valida o token
// e monta o JSON; as tabelas não têm leitura anon).
export const load: PageServerLoad = async ({ params, cookies }) => {
  const supa = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet: any[]) => toSet.forEach((c: any) => cookies.set(c.name, c.value, { ...c.options, path: '/' }))
    }
  });

  const { data, error: err } = await supa.rpc('territorio_publico' as any, { p_token: params.token } as any);
  if (err) throw error(500, 'Erro carregando território');
  if (!data) throw error(404, 'Link inválido ou expirado');

  return { territorio: data as any, token: params.token };
};
