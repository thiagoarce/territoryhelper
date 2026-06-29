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

  const { data: tok, error: errT } = await supa
    .from('cartas_tokens')
    .select('local_id, expira_em')
    .eq('token', params.token)
    .maybeSingle();
  if (errT) throw errT;
  if (!tok) throw error(404, 'Link inválido ou expirado');
  if (tok.expira_em && new Date(tok.expira_em) < new Date()) {
    throw error(410, 'Link expirado');
  }

  const { data: local } = await supa
    .from('locais')
    .select('id, logradouro, numero, nome, tipo_entrada, acesso_caixas, acesso_interfones, irmao_mora, nome_irmao, notas')
    .eq('id', tok.local_id)
    .maybeSingle();
  if (!local) throw error(404, 'Prédio não encontrado');

  const { data: unidades } = await supa
    .from('unidades')
    .select('id, complemento, carta_entregue, desocupado, nao_escrever, nota')
    .eq('local_id', tok.local_id)
    .order('ordem', { ascending: true, nullsFirst: false })
    .order('complemento');

  return { token: params.token, local, unidades: unidades ?? [] };
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
