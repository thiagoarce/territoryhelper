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

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const r = await comCache(chaveQuadraCampo(params.id, profile.id), async () => {
    const pode = await verificarPosseQuadra(params.id, profile.id, profile.role ?? '');
    if (!pode) throw error(403, 'Você não tem essa quadra designada.');
    return carregarQuadraCampo(params.id);
  });

  return { ...r.valor, minhaRole: profile.role, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};
