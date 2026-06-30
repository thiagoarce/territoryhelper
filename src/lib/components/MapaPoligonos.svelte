<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';
  import type { LocalComGeo } from '../../routes/admin/poligonos/+page.server';

  type Basemap = 'positron' | 'liberty' | 'bright';

  const BASEMAPS: Record<Basemap, string> = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright'
  };

  type FaceCluster = { key: string; lat: number; lng: number; qtd: number; selecionada: boolean };
  type TceGeo = { id: string; nome: string; status: string; poly_geojson: unknown | null };

  let {
    quadras,
    locais,
    altura = 600,
    mostrarRotulos = true,
    mostrarEnderecos = false,
    mostrarFaces = false,
    faces = [],
    tces = [],
    filtroTipo = 'ambos',
    filtroVinculo = 'ambos',
    quadraDestaque = null,
    colorirPorTerritorio = false,
    selecionadosLocais = $bindable(new Set<number>()),
    selecionadasQuadras = $bindable(new Set<string>()),
    basemap = $bindable<Basemap>('bright'),
    onClickQuadra,
    onClickLocal,
    onClickFace,
    onDesenhoPronto
  }: {
    quadras: QuadraGeo[];
    locais: LocalComGeo[];
    altura?: number;
    mostrarRotulos?: boolean;
    mostrarEnderecos?: boolean;
    mostrarFaces?: boolean;
    faces?: FaceCluster[];
    tces?: TceGeo[];
    filtroTipo?: 'dom' | 'com' | 'ambos';
    filtroVinculo?: 'vinculados' | 'sem' | 'ambos';
    quadraDestaque?: string | null;
    colorirPorTerritorio?: boolean;
    selecionadosLocais?: Set<number>;
    selecionadasQuadras?: Set<string>;
    basemap?: Basemap;
    onClickQuadra?: (q: QuadraGeo) => void;
    onClickLocal?: (l: LocalComGeo) => void;
    onClickFace?: (key: string) => void;
    onDesenhoPronto?: () => void;
  } = $props();

  let container: HTMLDivElement;
  let mapa = $state<any>(null);
  let maplibre: any = null;
  let draw: any = null; // terra-draw instance

  // ---- API de desenho (terra-draw) exposta pro pai ----
  export function desenhando(): boolean {
    return !!draw && draw.enabled && draw.getMode?.() !== 'static';
  }
  export function desenharNova() {
    if (!draw) return;
    try { draw.clear(); draw.setMode('polygon'); } catch {}
  }
  export function editarForma(q: QuadraGeo) {
    if (!draw || !q.poly_geojson) return;
    try {
      draw.clear();
      draw.addFeatures([{
        type: 'Feature',
        geometry: q.poly_geojson as any,
        properties: { mode: 'polygon' }
      }]);
      draw.setMode('select');
    } catch (e) { console.error('editarForma', e); }
  }
  export function cancelarDesenho() {
    if (!draw) return;
    try { draw.clear(); draw.setMode('static'); } catch {}
  }
  // Retorna a geometria Polygon do desenho atual (ou null)
  export function pegarPoligono(): any {
    if (!draw) return null;
    try {
      const snap = draw.getSnapshot();
      const f = (snap ?? []).find((x: any) => x.geometry?.type === 'Polygon');
      return f ? f.geometry : null;
    } catch { return null; }
  }

  // Cor base dos pontos (NUNCA aninha zoom-interpolate; seleção é camada separada)
  function buildPointColor(): any {
    return [
      'case',
      ['==', ['get', 'has_quadra'], false], '#dc2626',
      ['==', ['get', 'tipo'], 'comercio'], '#0891b2',
      '#64748b'
    ];
  }

  function buildPointFilter(): any {
    const filters: any[] = ['all'];
    if (filtroTipo !== 'ambos') {
      // 'dom' = qualquer residencial (casa/predio/coletivo); 'com' = comercio
      if (filtroTipo === 'com') filters.push(['==', ['get', 'tipo'], 'comercio']);
      else filters.push(['!=', ['get', 'tipo'], 'comercio']);
    }
    if (filtroVinculo === 'vinculados') filters.push(['==', ['get', 'has_quadra'], true]);
    if (filtroVinculo === 'sem') filters.push(['==', ['get', 'has_quadra'], false]);
    return filters;
  }

  // Filtro da camada de selecionados (ids num literal)
  function buildSelFilter(): any {
    return ['in', ['get', 'id'], ['literal', [...selecionadosLocais]]];
  }

  // Fill das quadras: destaque (amarelo) > seleção (azul) > cor padrão.
  // Cor padrão = território (quando colorirPorTerritorio) ou cor da quadra.
  function buildFillExpr(): any {
    const sel = [...selecionadasQuadras];
    const base: any = colorirPorTerritorio ? ['get', 'terr_color'] : ['get', 'color'];
    let expr: any = base;
    if (sel.length > 0) {
      expr = ['case', ['in', ['get', 'id'], ['literal', sel]], '#4f46e5', base];
    }
    if (quadraDestaque) {
      expr = ['case', ['==', ['get', 'id'], quadraDestaque], '#fde047', expr];
    }
    return expr;
  }

  // ----- Reatividade (lê deps ANTES do guard pra Svelte rastrear) -----
  const selLocaisKey = $derived([...selecionadosLocais].sort().join('|'));
  const selQuadrasKey = $derived([...selecionadasQuadras].sort().join('|'));

  $effect(() => {
    void selLocaisKey;
    if (!mapa || !mapa.getLayer('locais-sel')) return;
    mapa.setFilter('locais-sel', buildSelFilter());
  });

  $effect(() => {
    const t = filtroTipo, v = filtroVinculo; void t; void v;
    if (!mapa || !mapa.getLayer('locais-points')) return;
    const f = buildPointFilter();
    mapa.setFilter('locais-points', f);
  });

  $effect(() => {
    void selQuadrasKey; void quadraDestaque; void colorirPorTerritorio;
    if (!mapa || !mapa.getLayer('quadras-fill')) return;
    mapa.setPaintProperty('quadras-fill', 'fill-color', buildFillExpr());
  });

  $effect(() => {
    const show = mostrarEnderecos, comFaces = mostrarFaces;
    if (!mapa || !mapa.getLayer('locais-points')) return;
    // Pontos individuais: aparecem só se endereços ON e faces OFF
    const visPts = show && !comFaces ? 'visible' : 'none';
    mapa.setLayoutProperty('locais-points', 'visibility', visPts);
    mapa.setLayoutProperty('locais-sel', 'visibility', visPts);
    // Faces: aparecem se endereços ON e faces ON
    const visFaces = show && comFaces ? 'visible' : 'none';
    if (mapa.getLayer('faces-cluster')) {
      mapa.setLayoutProperty('faces-cluster', 'visibility', visFaces);
      mapa.setLayoutProperty('faces-count', 'visibility', visFaces);
    }
  });

  // Atualiza fonte de faces quando muda (inclui estado de seleção)
  $effect(() => {
    void faces;
    if (!mapa || !mapa.getSource('faces')) return;
    mapa.getSource('faces').setData(facesGeoJson());
  });

  // Atualiza fonte de TCEs
  $effect(() => {
    void tces;
    if (!mapa || !mapa.getSource('tces')) return;
    mapa.getSource('tces').setData(tcesGeoJson());
  });

  $effect(() => {
    const v = mostrarRotulos;
    if (!mapa || !mapa.getLayer('quadras-label')) return;
    mapa.setLayoutProperty('quadras-label', 'visibility', v ? 'visible' : 'none');
  });

  let basemapAtual: Basemap | null = null;
  $effect(() => {
    const b = basemap;
    if (!mapa) return;
    if (basemapAtual === b) return;
    basemapAtual = b;
    try { mapa.setStyle(BASEMAPS[b]); } catch {}
  });

  // Atualiza GeoJSON quando dados mudam
  $effect(() => {
    void locais; void quadras;
    if (!mapa || !mapa.getSource('locais') || !mapa.getSource('quadras')) return;
    mapa.getSource('locais').setData(locaisGeoJson());
    mapa.getSource('quadras').setData(quadrasGeoJson());
  });

  function locaisGeoJson(): any {
    return {
      type: 'FeatureCollection',
      features: locais
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [l.lng!, l.lat!] },
          properties: {
            id: l.id, tipo: l.tipo, has_quadra: !!l.quadra_id,
            logradouro: l.logradouro, numero: l.numero
          }
        }))
    };
  }

  function facesGeoJson(): any {
    return {
      type: 'FeatureCollection',
      features: faces.map((f) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lng, f.lat] },
        properties: { key: f.key, qtd: f.qtd, selecionada: f.selecionada }
      }))
    };
  }

  function tcesGeoJson(): any {
    return {
      type: 'FeatureCollection',
      features: (tces ?? [])
        .filter((t) => t.poly_geojson)
        .map((t) => ({
          type: 'Feature',
          geometry: t.poly_geojson as any,
          properties: { id: t.id, nome: t.nome, status: t.status }
        }))
    };
  }

  function quadrasGeoJson(): any {
    return {
      type: 'FeatureCollection',
      features: quadras
        .filter((q) => q.poly_geojson)
        .map((q) => ({
          type: 'Feature',
          geometry: q.poly_geojson as any,
          properties: {
            id: q.id,
            color: q.color,
            terr_color: q.territorio_id ? q.color : '#cbd5e1',
            status: q.status,
            territorio_id: q.territorio_id ?? ''
          }
        }))
    };
  }

  onMount(async () => {
    const mod = await import('maplibre-gl');
    maplibre = mod.default ?? mod;
    if (!document.querySelector('link[data-maplibre-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      link.setAttribute('data-maplibre-css', '');
      document.head.appendChild(link);
    }

    mapa = new maplibre.Map({
      container,
      style: BASEMAPS[basemap],
      center: [-34.863, -7.115],
      zoom: 14,
      attributionControl: { compact: true } as any
    });
    mapa.addControl(new maplibre.NavigationControl({}), 'top-right');

    function setupCamadas() {
      if (!mapa.getStyle()) return;
      if (mapa.getLayer('quadras-fill')) return;

      mapa.addSource('quadras', { type: 'geojson', data: quadrasGeoJson() });
      mapa.addLayer({
        id: 'quadras-fill',
        type: 'fill',
        source: 'quadras',
        paint: { 'fill-color': buildFillExpr(), 'fill-opacity': 0.25 }
      });

      // TCEs (polígonos roxos)
      mapa.addSource('tces', { type: 'geojson', data: tcesGeoJson() });
      mapa.addLayer({
        id: 'tces-fill',
        type: 'fill',
        source: 'tces',
        paint: {
          'fill-color': ['case', ['==', ['get', 'status'], 'aberto'], '#9333ea', '#94a3b8'],
          'fill-opacity': 0.18
        }
      });
      mapa.addLayer({
        id: 'tces-line',
        type: 'line',
        source: 'tces',
        paint: { 'line-color': '#9333ea', 'line-width': 2, 'line-dasharray': [2, 1] }
      });
      mapa.addLayer({
        id: 'quadras-line',
        type: 'line',
        source: 'quadras',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 }
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
        paint: { 'text-color': '#1e293b', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }
      });

      // Pontos: camada BASE (zoom-interpolate no radius, cor por case)
      mapa.addSource('locais', { type: 'geojson', data: locaisGeoJson() });
      mapa.addLayer({
        id: 'locais-points',
        type: 'circle',
        source: 'locais',
        filter: buildPointFilter(),
        layout: { visibility: mostrarEnderecos ? 'visible' : 'none' },
        paint: {
          'circle-color': buildPointColor(),
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4, 18, 6],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
          'circle-opacity': 0.85
        }
      });
      // Pontos: camada SELECIONADOS (por cima, radius fixo + azul) — sem aninhar zoom
      mapa.addLayer({
        id: 'locais-sel',
        type: 'circle',
        source: 'locais',
        filter: buildSelFilter(),
        layout: { visibility: mostrarEnderecos ? 'visible' : 'none' },
        paint: {
          'circle-color': '#4f46e5',
          'circle-radius': 7,
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
          'circle-opacity': 1
        }
      });

      // Faces (cluster por face IBGE): círculo grande sized por qtd + contagem
      mapa.addSource('faces', { type: 'geojson', data: facesGeoJson() });
      mapa.addLayer({
        id: 'faces-cluster',
        type: 'circle',
        source: 'faces',
        layout: { visibility: 'none' },
        paint: {
          'circle-color': ['case', ['get', 'selecionada'], '#4f46e5', '#0891b2'],
          'circle-radius': ['interpolate', ['linear'], ['get', 'qtd'], 1, 8, 10, 16, 40, 26],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.85
        }
      });
      mapa.addLayer({
        id: 'faces-count',
        type: 'symbol',
        source: 'faces',
        layout: {
          visibility: 'none',
          'text-field': ['to-string', ['get', 'qtd']],
          'text-size': 11,
          'text-font': ['Noto Sans Regular']
        },
        paint: { 'text-color': '#fff' }
      });
    }

    mapa.on('style.load', setupCamadas);
    if (mapa.isStyleLoaded()) setupCamadas();

    mapa.on('load', () => {
      setupCamadas();

      mapa.on('click', 'locais-points', (e: any) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const l = (locais ?? []).find((x) => x.id === props.id);
        if (l && onClickLocal) onClickLocal(l);
        e.preventDefault?.();
      });

      mapa.on('click', 'quadras-fill', (e: any) => {
        if (e.defaultPrevented) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const q = (quadras ?? []).find((x) => x.id === props.id);
        if (q && onClickQuadra) onClickQuadra(q);
      });

      mapa.on('click', 'faces-cluster', (e: any) => {
        const key = e.features?.[0]?.properties?.key;
        if (key && onClickFace) onClickFace(key);
        e.preventDefault?.();
      });

      mapa.on('mouseenter', 'faces-cluster', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'faces-cluster', () => { mapa.getCanvas().style.cursor = ''; });
      mapa.on('mouseenter', 'locais-points', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'locais-points', () => { mapa.getCanvas().style.cursor = ''; });
      mapa.on('mouseenter', 'quadras-fill', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'quadras-fill', () => { mapa.getCanvas().style.cursor = ''; });

      // Fit bounds nas quadras
      try {
        let bounds: any = null;
        for (const q of quadras) {
          if (!q.poly_geojson) continue;
          const coords = (q.poly_geojson as any).coordinates?.[0] || [];
          for (const c of coords) {
            if (!bounds) bounds = new maplibre.LngLatBounds(c, c);
            else bounds.extend(c);
          }
        }
        if (bounds) mapa.fitBounds(bounds, { padding: 30, duration: 0 });
      } catch {}

      // Inicializa terra-draw (lazy) pra desenho/edição de polígonos
      (async () => {
        try {
          const [{ TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode }, { TerraDrawMapLibreGLAdapter }] =
            await Promise.all([import('terra-draw'), import('terra-draw-maplibre-gl-adapter')]);
          draw = new TerraDraw({
            adapter: new TerraDrawMapLibreGLAdapter({ map: mapa }),
            modes: [
              new TerraDrawPolygonMode(),
              new TerraDrawSelectMode({
                flags: {
                  polygon: {
                    feature: {
                      draggable: true,
                      coordinates: { midpoints: true, draggable: true, deletable: true }
                    }
                  }
                }
              })
            ]
          });
          draw.start();
          draw.setMode('static');
          // Ao terminar de desenhar um polígono novo, avisa o pai
          draw.on('finish', () => { if (onDesenhoPronto) onDesenhoPronto(); });
        } catch (e) {
          console.error('terra-draw init falhou', e);
        }
      })();
    });
  });

  onDestroy(() => {
    if (draw) try { draw.stop(); } catch {}
    if (mapa) try { mapa.remove(); } catch {}
  });
</script>

<div bind:this={container} class="rounded-xl overflow-hidden border border-slate-200 shadow-sm" style:height={altura + 'px'}></div>
