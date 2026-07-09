// W8 ("modo rua"): load UNIVERSAL no BROWSER (ssr=false) com cache
// offline — TCE abre sem sinal se prefetchado pela home/visitado antes.
// RLS decide o acesso (404 pra quem não enxerga o TCE), e 404 nunca cai
// pro cache. Actions continuam em +page.server.ts.
import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { comCache } from '$lib/offline/cache-leitura';
import { chaveTceCampo, carregarTceCampo } from '$lib/campo-fetchers';

export type { TceEndereco } from '$lib/campo-fetchers';

export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, '/login');

  const r = await comCache(chaveTceCampo(params.id, profile.id), () => carregarTceCampo(params.id));
  return { ...r.valor, cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm } };
};
