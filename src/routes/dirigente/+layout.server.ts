import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// /dirigente/* deprecado — modo campo é único (specs.md revisado).
// O que era o mapa do dirigente virou /publicador/mapa; arranjo e campanha
// ficam em /publicador/*. Este layout redireciona tudo.
export const load: LayoutServerLoad = async ({ url }) => {
  const rest = url.pathname.replace(/^\/dirigente/, '');
  const destino = rest === '' || rest === '/' ? '/publicador/mapa' : `/publicador${rest}`;
  throw redirect(301, destino);
};
