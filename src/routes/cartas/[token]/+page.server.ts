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

  // Início do ciclo EFETIVO de cartas deste prédio — o mais recente entre
  // o global (local_id null) e o específico do prédio (A19/T16). A policy
  // de cartas_ciclos libera SELECT pra anon; é só uma data.
  const [{ data: cicloGlobal }, { data: cicloLocal }] = await Promise.all([
    supa.from('cartas_ciclos').select('iniciado_em').is('local_id', null).order('id', { ascending: false }).limit(1).maybeSingle(),
    supa.from('cartas_ciclos').select('iniciado_em').eq('local_id', local.id).order('id', { ascending: false }).limit(1).maybeSingle()
  ]);
  const dataGlobal = (cicloGlobal as any)?.iniciado_em ?? null;
  const dataLocal = (cicloLocal as any)?.iniciado_em ?? null;
  const cicloCartasInicio = dataLocal && (!dataGlobal || dataLocal >= dataGlobal) ? dataLocal : dataGlobal;

  return { token: params.token, local, unidades, cicloCartasInicio };
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
