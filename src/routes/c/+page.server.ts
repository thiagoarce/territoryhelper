import type { PageServerLoad } from './$types';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Rota pública /c — mostra objetivos da campanha marcados como publico=true.
// Sem auth. Útil pra colocar em painel da Igreja, monitor, etc.
export const load: PageServerLoad = async ({ cookies }) => {
  const supa = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet: any[]) => toSet.forEach((c: any) => cookies.set(c.name, c.value, { ...c.options, path: '/' }))
    }
  });
  const { data: objetivos } = await supa
    .from('campanha')
    .select('*')
    .eq('publico', true)
    .order('ordem');
  return { objetivos: objetivos ?? [] };
};
