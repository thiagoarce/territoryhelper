<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LocalComUnidades } from '$lib/server/queries';

  let {
    quadraGeo,
    quadraColor,
    locais,
    altura = 280
  }: {
    quadraGeo: unknown | null;
    quadraColor: string;
    locais: LocalComUnidades[];
    altura?: number;
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let layerPontos: any = null;
  let userMarker: any = null;
  let watchId: number | null = null;

  function pontoEmojiPorTipo(tipo: string): string {
    if (tipo === 'predio') return '🏢';
    if (tipo === 'comercio') return '🏪';
    if (tipo === 'coletivo') return '🏨';
    if (tipo === 'terreno') return '◻';
    return '🏠';
  }

  onMount(async () => {
    // Import dinâmico — Leaflet só carrega no client
    const L = (await import('leaflet')).default;
    // CSS via CDN (mais leve que importar)
    if (!document.querySelector('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet-css', '');
      document.head.appendChild(link);
    }

    mapa = L.map(container, { zoomControl: true, attributionControl: false }).setView([-7.115, -34.863], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mapa);

    // Desenha polígono da quadra
    if (quadraGeo) {
      try {
        const layer = L.geoJSON(quadraGeo as any, {
          style: {
            color: quadraColor,
            weight: 3,
            fillOpacity: 0.15,
            fillColor: quadraColor
          }
        }).addTo(mapa);
        try { mapa.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch {}
      } catch (e) {
        console.error('Polígono inválido', e);
      }
    }

    // Pins dos locais
    layerPontos = L.layerGroup().addTo(mapa);
    for (const l of locais) {
      const geo: any = (l as any).geo_geojson;
      if (!geo || !geo.coordinates) continue;
      const [lng, lat] = geo.coordinates;
      const emoji = pontoEmojiPorTipo(l.tipo);
      const icon = L.divIcon({
        className: 'pin-local',
        html: `<div style="background:white;border:2px solid ${quadraColor};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.2)">${emoji}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const titulo = l.nome || `${l.logradouro}, ${l.numero}`;
      const sub = l.tipo === 'predio' ? `${l.unidades.length} apto(s)` : l.tipo;
      const m = L.marker([lat, lng], { icon }).addTo(layerPontos);
      m.bindTooltip(`<strong>${titulo}</strong><br>${sub}`, { direction: 'top', offset: [0, -10] });
      m.on('click', () => {
        const el = document.getElementById('local-' + l.id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary-500');
          setTimeout(() => el.classList.remove('ring-2', 'ring-primary-500'), 1500);
        }
      });
    }

    // GPS do publicador (azul)
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          if (!userMarker) {
            const dotIcon = L.divIcon({
              className: 'pin-user',
              html: `<div style="width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px rgba(37,99,235,.4)"></div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            });
            userMarker = L.marker([lat, lng], { icon: dotIcon, interactive: false }).addTo(mapa);
          } else {
            userMarker.setLatLng([lat, lng]);
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }
  });

  onDestroy(() => {
    if (watchId != null) {
      try { navigator.geolocation.clearWatch(watchId); } catch {}
    }
    if (mapa) {
      try { mapa.remove(); } catch {}
      mapa = null;
    }
  });
</script>

<div
  bind:this={container}
  class="rounded-lg overflow-hidden border border-slate-200 shadow-sm"
  style:height={altura + 'px'}
></div>
