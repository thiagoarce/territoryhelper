// Módulo de CENSO DE IDIOMA — consumidor exclusivo da malha
// `finalidade='language-census'`.
//
// Por que existe uma tela separada em vez de um filtro dentro de
// /admin/poligonos:
//
// 1. Domínio. O território de idioma é trabalho de OUTRO grupo/congregação.
//    A malha existe pra dar contexto visual e registrar o censo — não são
//    quadras operacionais da pregação regular. Endereço do CNEFE/IBGE nunca
//    entra aqui: dentro do idioma só vale endereço criado explicitamente
//    pelo publicador daquele idioma.
// 2. Desempenho. No piloto Monte Castelo a malha de idioma tem 6.763 áreas
//    contra 361 regulares. Carregar as duas juntas fazia a abertura do
//    editor territorial levar ~37s no celular. Separar as finalidades é a
//    correção de domínio E a correção de desempenho.
//
// A tela carrega só um resumo na abertura. As geometrias chegam por viewport,
// conforme o usuário aproxima/move o mapa — nunca a cidade inteira.
import type { PageLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { supabaseBrowser } from "$lib/supabase-browser";
import { resumoCensoIdioma } from "$lib/queries";
import { comCache } from "$lib/offline/cache-leitura";

export const ssr = false;

export const load: PageLoad = async ({ parent }) => {
  const { profile } = await parent();
  if (!profile) throw redirect(303, "/login");
  const r = await comCache(`admin:censo:v3:${profile.id}`, () => carregar());
  return {
    ...r.valor,
    cacheInfo: { deCache: r.deCache, gravadoEm: r.gravadoEm },
  };
};

async function carregar() {
  const supabase = supabaseBrowser();
  const resumo = await resumoCensoIdioma(supabase);
  return { resumo };
}
