<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let {
    quadras,
    altura = 600,
    onQuadraClick,
    densidade = false
  }: {
    quadras: QuadraGeo[];
    altura?: number;
    onQuadraClick?: (q: QuadraGeo) => void;
    densidade?: boolean;
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let userMarker: any = null;
  let watchId: number | null = null;

  const STATUS_COLORS: Record<string, string> = {
    pendente: 'rgba(245, 158, 11, 0.6)',   // amber
    concluido: 'rgba(34, 197, 94, 0.6)',   // green
    inativa: 'rgba(148, 163, 184, 0.3)'    // slate
  };

  onMount(async () => {
    const maplibreModule = await import('maplibre-gl');
    const maplibre = maplibreModule.default ?? maplibreModule;
    if (!document.querySelector('link[data-maplibre-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      link.setAttribute('data-maplibre-css', '');
      document.head.appendChild(link);
    }

    mapa = new maplibre.Map({
      container,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [-34.863, -7.115],
      zoom: 14,
      attributionControl: { compact: true } as any
    });
    mapa.addControl(new maplibre.NavigationControl({}), 'top-right');

    mapa.on('load', () => {
      // Aglutina todas as quadras como uma FeatureCollection
      const features = quadras
        .filter((q) => q.poly_geojson)
        .map((q) => ({
          type: 'Feature' as const,
          geometry: q.poly_geojson as any,
          properties: {
            id: q.id,
            color: q.color,
            status: q.status,
            territorio_id: q.territorio_id,
            qtd_locais: q.qtd_locais
          }
        }));

      mapa.addSource('quadras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features } as any
      });

      // Fill: por status OU por densidade (interpola amarelo→vermelho)
      const fillColor: any = densidade
        ? [
            'interpolate',
            ['linear'],
            ['get', 'qtd_locais'],
            0, '#fef3c7',
            5, '#fde68a',
            15, '#fcd34d',
            30, '#f59e0b',
            60, '#dc2626'
          ]
        : [
            'match',
            ['get', 'status'],
            'concluido', STATUS_COLORS.concluido,
            'inativa', STATUS_COLORS.inativa,
            STATUS_COLORS.pendente
          ];
      mapa.addLayer({
        id: 'quadras-fill',
        type: 'fill',
        source: 'quadras',
        paint: { 'fill-color': fillColor, 'fill-opacity': 0.45 }
      });

      // Borda com cor própria da quadra
      mapa.addLayer({
        id: 'quadras-line',
        type: 'line',
        source: 'quadras',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2
        }
      });

      // Label com ID
      mapa.addLayer({
        id: 'quadras-label',
        type: 'symbol',
        source: 'quadras',
        layout: {
          'text-field': ['get', 'id'],
          'text-size': 11,
          'text-font': ['Noto Sans Regular']
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#fff',
          'text-halo-width': 1.5
        }
      });

      // Click handler
      mapa.on('click', 'quadras-fill', (e: any) => {
        const props = e.features?.[0]?.properties;
        if (!props || !onQuadraClick) return;
        const q = quadras.find((x) => x.id === props.id);
        if (q) onQuadraClick(q);
      });
      mapa.on('mouseenter', 'quadras-fill', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'quadras-fill', () => { mapa.getCanvas().style.cursor = ''; });

      // Fit bounds em todas as quadras
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
