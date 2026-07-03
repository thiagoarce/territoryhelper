import type { Actions, PageServerLoad } from './$types';
import { error, fail } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Rota PÚBLICA — sem login. Valida token no DB.
export const load: PageServerLoad = async ({ params, cookies }) => {
  // Cria um client supabase anon (não usa locals porque essa rota é pública)
  const supa = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet: any[]) => toSet.forEach((c: any) => cookies.set(c.name, c.value, { ...c.options, path: '/' }))
    }
  });

  // RPC security definer — resolve token + devolve local/unidades sem
  // depender de RLS (que só libera SELECT em locais/unidades pra
  // `authenticated`; visitante deslogado com token válido tomava 404).
  const { data, error: errT } = await supa.rpc('carta_publica_dados' as any, { p_token: params.token });
  if (errT) {
    if (errT.message?.includes('expirado')) throw error(410, 'Link expirado');
    throw error(404, 'Link inválido ou expirado');
  }

  const local = (data as any)?.local ?? null;
  const unidades = (data as any)?.unidades ?? [];
  if (!local) throw error(404, 'Prédio não encontrado');

  return { token: params.token, local, unidades };
};

export const actions: Actions = {
  // Toggle via função RPC (que valida token + altera unidade).
  toggle: async ({ request, params, cookies }) => {
    const supa = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (toSet: any[]) => toSet.forEach((c: any) => cookies.set(c.name, c.value, { ...c.options, path: '/' }))
      }
    });
    const fd = await request.formData();
    const unidadeId = Number(fd.get('unidade_id') ?? 0);
    const campo = String(fd.get('campo') ?? '');
    if (!unidadeId || !['carta_entregue', 'desocupado', 'nao_escrever'].includes(campo)) {
      return fail(400, { erro: 'Parâmetros inválidos' });
    }
    const { error: err } = await supa.rpc('carta_publica_toggle' as any, {
      p_token: params.token,
      p_unidade_id: unidadeId,
      p_campo: campo
    });
    if (err) return fail(400, { erro: err.message });
    return { ok: true };
  }
};
