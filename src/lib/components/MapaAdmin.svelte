<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  type ColorirPor = 'status' | 'territorio' | 'densidade' | 'idade';
  type Basemap = 'positron' | 'liberty' | 'bright';

  const BASEMAPS: Record<Basemap, string> = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright'
  };

  let {
    quadras,
    altura = 600,
    colorirPor = 'status',
    mostrarRotulos = true,
    mostrarTerritorios = false,
    quadrasAlocadas = [],
    selecionadas = $bindable(new Set<string>()),
    basemap = $bindable<Basemap>('positron'),
    onClick,
    onLongPress
  }: {
    quadras: QuadraGeo[];
    altura?: number;
    colorirPor?: ColorirPor;
    mostrarRotulos?: boolean;
    mostrarTerritorios?: boolean;
    quadrasAlocadas?: string[];
    selecionadas?: Set<string>;
    basemap?: Basemap;
    onClick?: (q: QuadraGeo, multi: boolean) => void;
    onLongPress?: (q: QuadraGeo) => void;
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let userMarker: any = null;
  let watchId: number | null = null;

  // Expõe getCanvas pra export PNG
  export function exportarPng(): string | null {
    if (!mapa) return null;
    try { return mapa.getCanvas().toDataURL('image/png'); } catch { return null; }
  }

  // Recalcula fill quando muda colorirPor, selecionadas, alocadas
  $effect(() => {
    if (!mapa || !mapa.getLayer('quadras-fill')) return;
    const expr = buildFillExpr(colorirPor, selecionadas, new Set(quadrasAlocadas));
    mapa.setPaintProperty('quadras-fill', 'fill-color', expr);
  });

  $effect(() => {
    if (!mapa || !mapa.getLayer('quadras-label')) return;
    mapa.setLayoutProperty('quadras-label', 'visibility', mostrarRotulos ? 'visible' : 'none');
  });

  let basemapAtual: Basemap | null = null;
  $effect(() => {
    if (!mapa) return;
    if (basemapAtual === basemap) return;
    basemapAtual = basemap;
    try { mapa.setStyle(BASEMAPS[basemap]); } catch {}
  });

  function buildFillExpr(modo: ColorirPor, sel: Set<string>, alocadas: Set<string>): any {
    // Default por modo
    let defaultColor: any;
    if (modo === 'status') {
      defaultColor = [
        'match',
        ['get', 'status'],
        'concluido', 'rgba(34,197,94,0.5)',
        'inativa', 'rgba(148,163,184,0.25)',
        'rgba(245,158,11,0.5)'
      ];
    } else if (modo === 'territorio') {
      defaultColor = ['get', 'color'];
    } else if (modo === 'densidade') {
      defaultColor = [
        'interpolate', ['linear'], ['get', 'qtd_locais'],
        0, '#fef3c7', 5, '#fde68a', 15, '#fcd34d', 30, '#f59e0b', 60, '#dc2626'
      ];
    } else if (modo === 'idade') {
      // -1 = nunca concluído (cinza), 0-15d verde, 30d amarelo, 60d laranja, 90+ vermelho
      defaultColor = [
        'case',
        ['<', ['get', 'dias_concluido'], 0], 'rgba(148,163,184,0.25)',
        [
          'interpolate', ['linear'], ['get', 'dias_concluido'],
          0, 'rgba(34,197,94,0.55)',
          15, 'rgba(132,204,22,0.55)',
          30, 'rgba(250,204,21,0.55)',
          60, 'rgba(249,115,22,0.55)',
          90, 'rgba(220,38,38,0.6)'
        ]
      ];
    } else {
      defaultColor = 'rgba(148,163,184,0.3)';
    }
    // Selecionadas sempre destacam (azul forte) — match exige >=1 par, então só usa quando tem
    if (sel.size === 0) return defaultColor;
    const matchSel: any[] = ['match', ['get', 'id']];
    for (const id of sel) { matchSel.push(id); matchSel.push('#4f46e5'); }
    matchSel.push(defaultColor);
    return matchSel;
  }

  onMount(async () => {
    const mod = await import('maplibre-gl');
    const maplibre = mod.default ?? mod;
    if (!document.querySelector('link[data-maplibre-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      link.setAttribute('data-maplibre-css', '');
      document.head.appendChild(link);
    }

    mapa = new maplibre.Map({
      container,
      style: BASEMAPS[basemap] ?? BASEMAPS.positron,
      center: [-34.863, -7.115],
      zoom: 14,
      attributionControl: { compact: true } as any,
      ...({ preserveDrawingBuffer: true } as any)
    });
    mapa.addControl(new maplibre.NavigationControl({}), 'top-right');

    function setupCamadas() {
      if (mapa.getLayer('quadras-fill')) return; // já setupado
      const hoje = Date.now();
      const features = quadras
        .filter((q) => q.poly_geojson)
        .map((q) => {
          let dias = -1;
          if (q.data_conclusao) {
            const d = new Date(q.data_conclusao + 'T12:00:00').getTime();
            dias = Math.floor((hoje - d) / (1000 * 60 * 60 * 24));
          }
          return {
            type: 'Feature' as const,
            geometry: q.poly_geojson as any,
            properties: {
              id: q.id,
              color: q.color,
              status: q.status,
              territorio_id: q.territorio_id,
              qtd_locais: q.qtd_locais,
              dias_concluido: dias
            }
          };
        });

      mapa.addSource('quadras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features } as any
      });

      mapa.addLayer({
        id: 'quadras-fill',
        type: 'fill',
        source: 'quadras',
        paint: {
          'fill-color': buildFillExpr(colorirPor, selecionadas, new Set(quadrasAlocadas)),
          'fill-opacity': 0.5
        }
      });

      mapa.addLayer({
        id: 'quadras-line',
        type: 'line',
        source: 'quadras',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2
        }
      });

      mapa.addLayer({
        id: 'quadras-label',
        type: 'symbol',
        source: 'quadras',
        layout: {
          'text-field': ['get', 'id'],
          'text-size': 11,
          'text-font': ['Noto Sans Regular'],
          'visibility': mostrarRotulos ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5
        }
      });

      // Cadeado nas alocadas (símbolo)
      const alocadasFeatures = quadras
        .filter((q) => q.poly_geojson && quadrasAlocadas.includes(q.id))
        .map((q) => ({
          type: 'Feature' as const,
          geometry: (q.poly_geojson as any),
          properties: { id: q.id }
        }));

      mapa.addSource('alocadas', { type: 'geojson', data: { type: 'FeatureCollection', features: alocadasFeatures } as any });
      mapa.addLayer({
        id: 'alocadas-icon',
        type: 'symbol',
        source: 'alocadas',
        layout: {
          'text-field': '🔒',
          'text-size': 14,
          'text-offset': [0.8, -0.8],
          'text-allow-overlap': true
        }
      });
    }

    // Re-setup das camadas após cada troca de style (incluindo a primeira)
    mapa.on('style.load', setupCamadas);

    mapa.on('load', () => {

      // Click — multi-seleção se shift/ctrl, ou se já tem seleção
      let pressStart: number | null = null;
      let pressTimer: any = null;
      let pressTarget: string | null = null;

      mapa.on('mousedown', 'quadras-fill', (e: any) => {
        pressStart = Date.now();
        pressTarget = e.features?.[0]?.properties?.id;
        pressTimer = setTimeout(() => {
          if (pressTarget && onLongPress) {
            const q = quadras.find((x) => x.id === pressTarget);
            if (q) onLongPress(q);
          }
          pressTimer = null;
          pressStart = null;
        }, 600);
      });
      mapa.on('mouseup', 'quadras-fill', () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressStart = null;
      });
      mapa.on('touchstart', 'quadras-fill', (e: any) => {
        pressStart = Date.now();
        pressTarget = e.features?.[0]?.properties?.id;
        pressTimer = setTimeout(() => {
          if (pressTarget && onLongPress) {
            const q = quadras.find((x) => x.id === pressTarget);
            if (q) onLongPress(q);
          }
          pressTimer = null;
          pressStart = null;
        }, 600);
      });
      mapa.on('touchend', 'quadras-fill', () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressStart = null;
      });

      mapa.on('click', 'quadras-fill', (e: any) => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        if (pressStart && Date.now() - pressStart > 500) return; // long-press handled
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const q = quadras.find((x) => x.id === props.id);
        if (!q) return;
        const multi = !!e.originalEvent?.shiftKey || !!e.originalEvent?.metaKey || selecionadas.size > 0;
        if (onClick) onClick(q, multi);
      });
      mapa.on('mouseenter', 'quadras-fill', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'quadras-fill', () => { mapa.getCanvas().style.cursor = ''; });

      // Fit bounds em todas
      try {
        if (features.length > 0) {
          let bounds: any = null;
          for (const f of features) {
            const coords = (f.geometry as any).coordinates?.[0] || [];
            for (const c of coords) {
              if (!bounds) bounds = new maplibre.LngLatBounds(c as any, c as any);
              else bounds.extend(c as any);
            }
          }
          if (bounds) mapa.fitBounds(bounds, { padding: 30, duration: 0 });
        }
      } catch {}

      // GPS
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          if (!userMarker) {
            const el = document.createElement('div');
            el.style.cssText = `width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(37,99,235,.3)`;
            userMarker = new maplibre.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(mapa);
          } else {
            userMarker.setLngLat([longitude, latitude]);
          }
        }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
      }
    });
  });

  onDestroy(() => {
    if (watchId != null) try { navigator.geolocation.clearWatch(watchId); } catch {}
    if (mapa) try { mapa.remove(); } catch {}
  });
</script>

<div
  bind:this={container}
  class="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
  style:height={altura + 'px'}
></div>
