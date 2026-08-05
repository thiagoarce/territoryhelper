// Fundo do mapa (basemap) num lugar só. A constante estava DUPLICADA em
// 4 componentes (MapaAdmin, AdminMapa, MapaPoligonos, CartaoTerritorio)
// + um literal solto no QuadraMap — mudar de provedor ou acrescentar um
// estilo exigia lembrar dos 5.
//
// Estilos do OpenFreeMap (grátis, sem chave):
//   positron — cinza claro, quase sem rótulo de comércio
//   liberty  — ruas + comércio/banco/escola nomeados (padrão do campo:
//              é o que dá "ponto de referência" pra quem está na rua)
//   bright   — o mais colorido/carregado
export type Basemap = 'positron' | 'liberty' | 'bright';

export const BASEMAPS: Record<Basemap, string> = {
  positron: 'https://tiles.openfreemap.org/styles/positron',
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright'
};

// Default das telas de CAMPO: o cinza escondia comércio/banco/escola e a
// queixa real do publicador era "não sei onde esse mapa fica".
export const BASEMAP_CAMPO: Basemap = 'liberty';

export function ehBasemapValido(b: unknown): b is Basemap {
  return b === 'positron' || b === 'liberty' || b === 'bright';
}

/** URL do estilo, com fallback — nunca devolve undefined pro MapLibre. */
export function urlBasemap(b: string | null | undefined): string {
  return ehBasemapValido(b) ? BASEMAPS[b] : BASEMAPS.positron;
}

/**
 * Troca o fundo de um mapa JÁ CRIADO. Passa pelo `estiloDoMapa` (mesmo
 * decisor do `criarMapaBase`) em vez de mandar a URL crua pro setStyle:
 * sem isso, trocar de fundo offline/com rede ruim perdia o fallback
 * PMTiles e a cópia do style em IndexedDB, e o mapa ficava cinza.
 */
export async function trocarBasemap(mapa: any, b: string | null | undefined): Promise<void> {
  if (!mapa) return;
  const { estiloDoMapa } = await import('$lib/mapa-offline');
  mapa.setStyle(await estiloDoMapa(urlBasemap(b)));
}
