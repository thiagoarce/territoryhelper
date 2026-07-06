import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// /dirigente/* deprecado — modo campo é único (specs.md revisado).
// O que era o mapa do dirigente virou /publicador/mapa; arranjo e campanha
// ficam em /publicador/*. Este layout redireciona tudo.
export const load: LayoutServerLoad = async ({ url }) => {
  const rest = url.pathname.replace(/^\/dirigente/, '');
  // Home do dirigente é a carteira dele (/publicador) — o mapa geral virou
  // read-only e mora atrás do ícone no header, não faz sentido como landing.
  const destino = rest === '' || rest === '/' ? '/publicador' : `/publicador${rest}`;
  throw redirect(301, destino);
};
