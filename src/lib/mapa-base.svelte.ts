// Base compartilhada dos 4 componentes de mapa (MapaAdmin, AdminMapa,
// MapaPoligonos, QuadraMap): criação da instância MapLibre + estado de
// carregamento visível. Antes cada componente repetia o mesmo bloco de
// `import('maplibre-gl')` + `new maplibre.Map({...})` + NavigationControl
// — e nenhum mostrava nada enquanto o style não chegava, então rede
// lenta/instável na abertura parecia "mapa quebrado" (tela cinza muda)
// em vez de "carregando".
import { estiloDoMapa } from '$lib/mapa-offline';

export interface OpcoesMapaBase {
  container: HTMLDivElement;
  styleUrl: string;
  center?: [number, number];
  zoom?: number;
  extra?: Record<string, unknown>;
  /** false pra não adicionar NavigationControl; objeto = opções dele */
  navControl?: false | Record<string, unknown>;
}

export async function criarMapaBase(
  opts: OpcoesMapaBase
): Promise<{ maplibre: any; mapa: any }> {
  const mod = await import('maplibre-gl');
  const maplibre = mod.default ?? mod;
  const mapa = new maplibre.Map({
    container: opts.container,
    style: await estiloDoMapa(opts.styleUrl),
    center: opts.center ?? [-34.863, -7.115],
    zoom: opts.zoom ?? 14,
    attributionControl: { compact: true } as any,
    ...(opts.extra ?? {})
  });
  if (opts.navControl !== false) {
    mapa.addControl(new maplibre.NavigationControl(opts.navControl ?? {}), 'top-right');
  }
  return { maplibre, mapa };
}

// Estado de carregamento pra overlay visual: "carregando" some no
// primeiro 'load'; "demorando" liga depois de 6s (ainda pode chegar);
// "travado" liga depois de 20s (oferece recarregar — cobre o caso raro
// de erro de rede/JS que nenhum retry interno resolveu). Timeouts
// zerados no destruir() (chamar no onDestroy do componente).
export function estadoCarregamentoMapa(mapa: any) {
  let carregando = $state(true);
  let demorando = $state(false);
  let travado = $state(false);

  mapa.once('load', () => {
    carregando = false;
  });

  const tDemora = setTimeout(() => {
    if (carregando) demorando = true;
  }, 6000);
  const tTravado = setTimeout(() => {
    if (carregando) travado = true;
  }, 20000);

  return {
    get carregando() {
      return carregando;
    },
    get demorando() {
      return demorando;
    },
    get travado() {
      return travado;
    },
    destruir() {
      clearTimeout(tDemora);
      clearTimeout(tTravado);
    }
  };
}
