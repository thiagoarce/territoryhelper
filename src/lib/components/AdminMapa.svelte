<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  interface POI {
    id: string;
    lat: number;
    lng: number;
    nome: string;
    emoji: string;
    url?: string;
  }

  let {
    quadras,
    altura = 600,
    onQuadraClick,
    densidade = false,
    pois = []
  }: {
    quadras: QuadraGeo[];
    altura?: number;
    onQuadraClick?: (q: QuadraGeo) => void;
    densidade?: boolean;
    pois?: POI[];
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let userMarker: any = null;
  let watchId: number | null = null;
  let poiMarkers: any[] = [];
  let maplibreRef: any = null;

  // Expõe o canvas pra screenshot. Chamado de fora via bind:this.
  export function exportarPng(): string | null {
    if (!mapa) return null;
    try {
      const canvas = mapa.getCanvas();
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('exportar png falhou:', e);
      return null;
    }
  }

  // Centraliza mapa na quadra (usada pelo dirigente ao clicar em Estacionar)
  export function centralizarEmQuadra(q: QuadraGeo): void {
    if (!mapa || !q.poly_geojson) return;
    const coords: any[] = (q.poly_geojson as any).coordinates?.[0] ?? [];
    if (coords.length === 0) return;
    const sumLat = coords.reduce((s: number, c: number[]) => s + c[1], 0);
    const sumLng = coords.reduce((s: number, c: number[]) => s + c[0], 0);
    mapa.easeTo({ center: [sumLng / coords.length, sumLat / coords.length], zoom: 16, duration: 400 });
  }

  // Renderiza pois como marcadores clicáveis (Google Maps ao clicar).
  // Reativo — muda quando o prop pois muda.
  $effect(() => {
    if (!mapa || !maplibreRef) return;
    // limpa marcadores antigos
    for (const m of poiMarkers) try { m.remove(); } catch {}
    poiMarkers = [];
    for (const p of pois) {
      const el = document.createElement('button');
      el.type = 'button';
      el.title = p.nome;
      el.setAttribute('aria-label', p.nome);
      el.style.cssText = 'width:32px;height:32px;border-radius:50%;background:white;border:2px solid #2563eb;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;padding:0;';
      el.textContent = p.emoji;
      if (p.url) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          window.open(p.url, '_blank', 'noopener');
        });
      }
      const m = new maplibreRef.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(mapa);
      poiMarkers.push(m);
    }
  });

  const STATUS_COLORS: Record<string, string> = {
    pendente: 'rgba(245, 158, 11, 0.6)',   // amber
    concluido: 'rgba(34, 197, 94, 0.6)',   // green
    inativa: 'rgba(148, 163, 184, 0.3)'    // slate
  };

  onMount(async () => {
    const maplibreModule = await import('maplibre-gl');
    const maplibre = maplibreModule.default ?? maplibreModule;
    maplibreRef = maplibre;
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
      attributionControl: { compact: true } as any,
      // habilita screenshot via toDataURL (perf negligível pra este uso)
      ...({ preserveDrawingBuffer: true } as any)
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
