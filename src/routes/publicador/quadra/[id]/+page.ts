// W8 ("modo rua"): load UNIVERSAL no BROWSER (ssr=false) com cache
// offline — a tela de trabalhar a quadra abre sem sinal se ela estiver
// na carteira prefetchada pela home (ou já tiver sido visitada). Posse
// verificada no browser com as MESMAS cláusulas do guard server antigo
// (verificarPosseQuadra espelha exigirQuadraDesignada/pode_editar_local)
// — quem não tem a quadra recebe 403 igual antes, e 403/404 NUNCA caem
// pro cache (regra do comCache). Actions continuam em +page.server.ts
// com o guard de posse próprio (pode_editar_local via RPC).
import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { comCache } from '$lib/offline/cache-leitura';
import { chaveQuadraCampo, carregarQuadraCampo, verificarPosseQuadra } from '$lib/campo-fetchers';
import { supabaseBrowser } from '$lib/supabase-browser';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const r = await comCache(chaveQuadraCampo(params.id, profile.id), async () => {
    const pode = await verificarPosseQuadra(params.id, profile.id, profile.role ?? '');
    if (!pode) throw error(403, 'Você não tem essa quadra designada.');
    const dados = await carregarQuadraCampo(params.id);
    const { data: podeConcluir, error: erroPermissao } = await supabaseBrowser().rpc('pode_concluir_quadra', {
      p_quadra_id: params.id,
      p_user_id: profile.id
    });
    // A RPC existe na baseline nova. Na instância legada, a ausência dela
    // preserva o comportamento global de dirigente/admin até uma atualização explícita.
    return {
      ...dados,
      podeConcluirQuadra: erroPermissao
        ? ['dirigente', 'admin'].includes(profile.role ?? '')
        : !!podeConcluir
    };
  });

  return { ...r.valor, minhaRole: profile.role, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};
