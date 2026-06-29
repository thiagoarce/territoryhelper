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
    // MapLibre + Protomaps via import dinâmico (não carrega no SSR)
    const maplibreModule = await import('maplibre-gl');
    const maplibre = maplibreModule.default ?? maplibreModule;
    const { Protocol } = await import('pmtiles');

    // CSS via CDN — economiza ~80KB no bundle
    if (!document.querySelector('link[data-maplibre-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      link.setAttribute('data-maplibre-css', '');
      document.head.appendChild(link);
    }

    // Registra protocolo pmtiles (caso queira self-host depois)
    const protocol = new Protocol();
    maplibre.addProtocol('pmtiles', protocol.tile.bind(protocol) as any);

    // OpenFreeMap — vector tiles 100% free, sem API key, sem limites.
    // Estilos disponíveis: liberty (colorido), bright, positron (cinza claro).
    // Pra mudar: troca 'positron' por 'liberty' ou 'bright'.
    const style = 'https://tiles.openfreemap.org/styles/positron';

    mapa = new maplibre.Map({
      container,
      style: style as any,
      center: [-34.863, -7.115],
      zoom: 15,
      attributionControl: { compact: true } as any
    });

    mapa.addControl(new maplibre.NavigationControl({ visualizePitch: false }), 'top-right');

    mapa.on('load', () => {
      // Polígono da quadra
      if (quadraGeo) {
        mapa.addSource('quadra', {
          type: 'geojson',
          data: { type: 'Feature', geometry: quadraGeo, properties: {} } as any
        });
        mapa.addLayer({
          id: 'quadra-fill',
          type: 'fill',
          source: 'quadra',
          paint: { 'fill-color': quadraColor, 'fill-opacity': 0.18 }
        });
        mapa.addLayer({
          id: 'quadra-line',
          type: 'line',
          source: 'quadra',
          paint: { 'line-color': quadraColor, 'line-width': 3 }
        });
        // Fit bounds
        try {
          const coords = (quadraGeo as any).coordinates?.[0] || [];
          if (coords.length > 0) {
            const bounds = coords.reduce(
              (b: any, c: number[]) => b.extend(c as any),
              new maplibre.LngLatBounds(coords[0], coords[0])
            );
            mapa.fitBounds(bounds, { padding: 40, duration: 0 });
          }
        } catch (e) {
          console.warn('fit bounds:', e);
        }
      }

      // Pins dos locais (via HTML markers — emoji custom)
      for (const l of locais) {
        const geo: any = (l as any).geo_geojson;
        if (!geo || !geo.coordinates) continue;
        const [lng, lat] = geo.coordinates;
        const el = document.createElement('div');
        el.style.cssText = `
          background:white;
          border:2px solid ${quadraColor};
          border-radius:50%;
          width:30px;height:30px;
          display:flex;align-items:center;justify-content:center;
          font-size:14px;
          box-shadow:0 2px 4px rgba(0,0,0,.15);
          cursor:pointer;
          transition:transform .15s;
        `;
        el.textContent = pontoEmojiPorTipo(l.tipo);
        el.onmouseenter = () => (el.style.transform = 'scale(1.15)');
        el.onmouseleave = () => (el.style.transform = '');
        el.onclick = () => {
          const card = document.getElementById('local-' + l.id);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('ring-2', 'ring-primary-500');
            setTimeout(() => card.classList.remove('ring-2', 'ring-primary-500'), 1500);
          }
        };
        const popup = new maplibre.Popup({ offset: 18, closeButton: false })
          .setHTML(
            `<div style="font-size:13px"><strong>${l.nome || l.logradouro + ', ' + l.numero}</strong><br><span style="color:#666">${l.tipo === 'predio' ? l.unidades.length + ' apto(s)' : l.tipo}</span></div>`
          );
        new maplibre.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(mapa);
      }

      // GPS publicador (ponto azul pulsando)
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            if (!userMarker) {
              const el = document.createElement('div');
              el.style.cssText = `
                width:18px;height:18px;
                background:#2563eb;
                border:3px solid white;
                border-radius:50%;
                box-shadow:0 0 0 4px rgba(37,99,235,.3);
                animation:user-pulse 2s ease-in-out infinite;
              `;
              const keyframes = document.createElement('style');
              keyframes.textContent = `@keyframes user-pulse{0%,100%{box-shadow:0 0 0 4px rgba(37,99,235,.3)}50%{box-shadow:0 0 0 10px rgba(37,99,235,.1)}}`;
              if (!document.querySelector('style[data-user-pulse]')) {
                keyframes.setAttribute('data-user-pulse', '');
                document.head.appendChild(keyframes);
              }
              userMarker = new maplibre.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(mapa);
            } else {
              userMarker.setLngLat([longitude, latitude]);
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
      }
    });
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
  class="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
  style:height={altura + 'px'}
></div>
