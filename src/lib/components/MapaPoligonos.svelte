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

  let {
    quadras,
    locais,
    altura = 600,
    mostrarRotulos = true,
    filtroTipo = 'ambos',
    filtroVinculo = 'ambos',
    quadraDestaque = null,
    selecionadosLocais = $bindable(new Set<number>()),
    basemap = $bindable<Basemap>('positron'),
    onClickQuadra,
    onClickLocal
  }: {
    quadras: QuadraGeo[];
    locais: LocalComGeo[];
    altura?: number;
    mostrarRotulos?: boolean;
    filtroTipo?: 'dom' | 'com' | 'ambos';
    filtroVinculo?: 'vinculados' | 'sem' | 'ambos';
    quadraDestaque?: string | null;
    selecionadosLocais?: Set<number>;
    basemap?: Basemap;
    onClickQuadra?: (q: QuadraGeo) => void;
    onClickLocal?: (l: LocalComGeo) => void;
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let maplibre: any = null;

  function buildPointColor(sel: Set<number>): any {
    if (sel.size === 0) {
      return [
        'case',
        ['==', ['get', 'has_quadra'], false], '#dc2626',
        ['==', ['get', 'tipo'], 'comercio'], '#0891b2',
        '#64748b'
      ];
    }
    const matchSel: any[] = ['match', ['get', 'id']];
    for (const id of sel) { matchSel.push(id); matchSel.push('#4f46e5'); }
    matchSel.push([
      'case',
      ['==', ['get', 'has_quadra'], false], '#dc2626',
      ['==', ['get', 'tipo'], 'comercio'], '#0891b2',
      '#64748b'
    ]);
    return matchSel;
  }

  function buildPointRadius(sel: Set<number>): any {
    if (sel.size === 0) {
      return ['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4, 18, 6];
    }
    const matchSel: any[] = ['match', ['get', 'id']];
    for (const id of sel) { matchSel.push(id); matchSel.push(7); }
    matchSel.push(['interpolate', ['linear'], ['zoom'], 12, 2, 16, 4, 18, 6]);
    return matchSel;
  }

  function buildPointFilter(): any {
    const filters: any[] = ['all'];
    if (filtroTipo !== 'ambos') {
      filters.push(['==', ['get', 'tipo'], filtroTipo === 'com' ? 'comercio' : 'casa']);
    }
    if (filtroVinculo === 'vinculados') filters.push(['==', ['get', 'has_quadra'], true]);
    if (filtroVinculo === 'sem') filters.push(['==', ['get', 'has_quadra'], false]);
    return filters;
  }

  function buildFillExpr(destaque: string | null): any {
    if (!destaque) return ['get', 'color'];
    return [
      'case',
      ['==', ['get', 'id'], destaque], '#fde047',
      ['get', 'color']
    ];
  }

  const selKey = $derived([...selecionadosLocais].sort().join('|'));
  $effect(() => {
    selKey;
    if (!mapa || !mapa.getLayer('locais-points')) return;
    mapa.setPaintProperty('locais-points', 'circle-color', buildPointColor(selecionadosLocais));
    mapa.setPaintProperty('locais-points', 'circle-radius', buildPointRadius(selecionadosLocais));
  });

  $effect(() => {
    if (!mapa || !mapa.getLayer('locais-points')) return;
    mapa.setFilter('locais-points', buildPointFilter());
  });

  $effect(() => {
    if (!mapa || !mapa.getLayer('quadras-fill')) return;
    mapa.setPaintProperty('quadras-fill', 'fill-color', buildFillExpr(quadraDestaque));
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

      // Quadras (polígonos)
      const quadrasFeatures = quadras
        .filter((q) => q.poly_geojson)
        .map((q) => ({
          type: 'Feature' as const,
          geometry: q.poly_geojson as any,
          properties: { id: q.id, color: q.color, status: q.status }
        }));

      mapa.addSource('quadras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: quadrasFeatures } as any
      });
      mapa.addLayer({
        id: 'quadras-fill',
        type: 'fill',
        source: 'quadras',
        paint: { 'fill-color': buildFillExpr(quadraDestaque), 'fill-opacity': 0.2 }
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

      // Locais (pontos)
      const locaisFeatures = locais
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point', coordinates: [l.lng!, l.lat!] } as any,
          properties: {
            id: l.id,
            tipo: l.tipo,
            has_quadra: !!l.quadra_id,
            logradouro: l.logradouro,
            numero: l.numero
          }
        }));
      mapa.addSource('locais', { type: 'geojson', data: { type: 'FeatureCollection', features: locaisFeatures } as any });
      mapa.addLayer({
        id: 'locais-points',
        type: 'circle',
        source: 'locais',
        filter: buildPointFilter(),
        paint: {
          'circle-color': buildPointColor(selecionadosLocais),
          'circle-radius': buildPointRadius(selecionadosLocais),
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1,
          'circle-opacity': 0.85
        }
      });
    }

    mapa.on('style.load', setupCamadas);
    if (mapa.isStyleLoaded()) setupCamadas();

    mapa.on('load', () => {
      setupCamadas();

      // Click no ponto → toggle seleção
      mapa.on('click', 'locais-points', (e: any) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const l = locais.find((x) => x.id === props.id);
        if (!l) return;
        if (onClickLocal) onClickLocal(l);
        e.preventDefault?.();
      });

      // Click numa quadra
      mapa.on('click', 'quadras-fill', (e: any) => {
        // Se clicou num ponto que está em cima, ignora
        if (e.defaultPrevented) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const q = quadras.find((x) => x.id === props.id);
        if (!q) return;
        if (onClickQuadra) onClickQuadra(q);
      });

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
    });
  });

  onDestroy(() => {
    if (mapa) try { mapa.remove(); } catch {}
  });
</script>

<div bind:this={container} class="rounded-xl overflow-hidden border border-slate-200 shadow-sm" style:height={altura + 'px'}></div>
