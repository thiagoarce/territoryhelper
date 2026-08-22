import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /dirigente/* deprecado — modo campo é único (specs.md revisado). O que
// era o mapa do dirigente virou /publicador/mapa; arranjo e campanha ficam
// em /publicador/*.
//
// Isto era um `+layout.server.ts` em /dirigente, e NÃO funcionava: pasta
// só com layout não é rota, então /dirigente e /dirigente/qualquer-coisa
// davam 404 sem o layout nem rodar. Rota rest (`[...resto]`, casa também
// com zero segmentos = /dirigente puro) é o que faz o redirect existir de
// verdade pra link/bookmark antigo.
export const load: PageServerLoad = async ({ params }) => {
  const resto = params.resto ? `/${params.resto}` : '';
  // Home do dirigente é a carteira dele (/publicador) — o mapa geral virou
  // read-only e mora atrás do ícone no header, não faz sentido como landing.
  throw redirect(301, `/publicador${resto}`);
};
