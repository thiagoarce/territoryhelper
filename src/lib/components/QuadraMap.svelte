<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount, onDestroy, mount } from 'svelte';
  import { criarMapaBase, estadoCarregamentoMapa } from '$lib/mapa-base.svelte';
  import MapaCarregando from '$lib/components/MapaCarregando.svelte';
  import type { LocalComUnidades } from '$lib/server/queries';
  import Icon, { type NomeIcone } from '$lib/ui/Icon.svelte';

  let {
    quadraGeo,
    quadraColor,
    locais,
    numeroPorLocal = new Map(),
    altura = 280
  }: {
    quadraGeo: unknown | null;
    quadraColor: string;
    locais: LocalComUnidades[];
    /** id do local → posição na lista, pra correlacionar pino do mapa com o card da lista */
    numeroPorLocal?: Map<number, number>;
    altura?: number;
  } = $props();

  let container: HTMLDivElement;
  let mapa: any = null;
  let maplibreRef: any = null;
  let carregamento: ReturnType<typeof estadoCarregamentoMapa> | null = $state(null);
  let userMarker: any = null;
  let localMarkers: any[] = [];
  let watchId: number | null = null;
  let mapaPronto = $state(false);

  function iconePorTipo(tipo: string): NomeIcone {
    if (tipo === 'predio') return 'building';
    if (tipo === 'comercio') return 'store';
    if (tipo === 'coletivo') return 'users';
    if (tipo === 'terreno') return 'trees';
    return 'home';
  }

  // Pins dos locais — ícone lucide por tipo (casa/prédio/comércio/coletivo/
  // terreno) + numeração que correlaciona o pino com o card da lista.
  // Extraído do onMount (T4/U1: "Inverter ordem"/reordenar mudava a
  // numeração da LISTA mas os pinos do mapa, desenhados uma única vez
  // no mount, continuavam com os números antigos — precisa redesenhar
  // sempre que `locais`/`numeroPorLocal` mudarem, não só na primeira vez).
  function desenharPinos() {
    if (!mapa || !maplibreRef) return;
    for (const m of localMarkers) { try { m.remove(); } catch {} }
    localMarkers = [];

    // Espalha pinos quase coincidentes (ex: vários locais no mesmo prédio)
    // num pequeno círculo ao redor do ponto real — senão ficam empilhados
    // e impossíveis de tocar individualmente no mapa.
    const chave = (lng: number, lat: number) => `${lng.toFixed(5)},${lat.toFixed(5)}`;
    const contagemPorChave = new Map<string, number>();
    for (const l of locais) {
      const geo: any = (l as any).geo_geojson;
      if (!geo?.coordinates) continue;
      const k = chave(geo.coordinates[0], geo.coordinates[1]);
      contagemPorChave.set(k, (contagemPorChave.get(k) ?? 0) + 1);
    }
    const indicePorChave = new Map<string, number>();

    for (const l of locais) {
      const geo: any = (l as any).geo_geojson;
      if (!geo || !geo.coordinates) continue;
      let [lng, lat] = geo.coordinates;
      const k = chave(lng, lat);
      const total = contagemPorChave.get(k) ?? 1;
      if (total > 1) {
        const indice = indicePorChave.get(k) ?? 0;
        indicePorChave.set(k, indice + 1);
        const raio = 0.00006; // ~6-7m — só pra destacar cada pino, não é posição real
        const angulo = (2 * Math.PI * indice) / total;
        lng += raio * Math.cos(angulo);
        lat += raio * Math.sin(angulo);
      }
      // El é o elemento-raiz do Marker — o MapLibre escreve a própria
      // translação de posição em `el.style.transform` a cada render, então
      // NUNCA se pode sobrescrever esse transform (senão o pino "voa" pra
      // um canto do mapa). O efeito de hover/tap fica isolado no `inner`.
      const el = document.createElement('div');
      el.style.cssText = `cursor:pointer;`;
      const inner = document.createElement('div');
      inner.style.cssText = `
        position:relative;
        background:white;
        border:2px solid ${quadraColor};
        border-radius:50%;
        width:30px;height:30px;
        display:flex;align-items:center;justify-content:center;
        color:${quadraColor};
        box-shadow:0 2px 4px rgba(0,0,0,.15);
        transition:transform .15s;
      `;
      el.appendChild(inner);
      mount(Icon, { target: inner, props: { nome: iconePorTipo(l.tipo), size: 16 } });
      const numero = numeroPorLocal.get(l.id);
      if (numero != null) {
        const badge = document.createElement('span');
        badge.textContent = String(numero);
        badge.style.cssText = `
          position:absolute; top:-6px; right:-6px;
          background:#1e293b; color:white;
          border-radius:9999px; min-width:16px; height:16px;
          font-size:10px; font-weight:600; line-height:16px; text-align:center;
          padding:0 3px;
        `;
        inner.appendChild(badge);
      }
      el.onmouseenter = () => (inner.style.transform = 'scale(1.15)');
      el.onmouseleave = () => (inner.style.transform = '');
      el.onclick = () => {
        const card = document.getElementById('local-' + l.id);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('ring-2', 'ring-primary-500');
          setTimeout(() => card.classList.remove('ring-2', 'ring-primary-500'), 1500);
        }
      };
      const popup = new maplibreRef.Popup({ offset: 18, closeButton: false })
        .setHTML(
          `<div style="font-size:13px"><strong>${l.nome || l.logradouro + ', ' + l.numero}</strong><br><span style="color:#666">${l.tipo === 'predio' ? l.unidades.length + ' apto(s)' : l.tipo}</span></div>`
        );
      const marker = new maplibreRef.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapa);
      localMarkers.push(marker);
    }
  }

  // Redesenha os pinos quando a ordem/lista muda (ex.: botão "Inverter
  // ordem", reordenar manual, filtro) — não só na primeira carga.
  $effect(() => {
    void locais;
    void numeroPorLocal;
    if (mapaPronto) desenharPinos();
  });

  onMount(async () => {
    // OpenFreeMap — vector tiles 100% free, sem API key, sem limites.
    // E4: offline com o mapa do município baixado, criarMapaBase troca
    // pro estilo pmtiles local (online busca o style com timeout +
    // cópia local — rede travada não deixa o mapa cinza). O
    // protocolo pmtiles é registrado SÓ em $lib/mapa-offline — não
    // registrar outro aqui (addProtocol é global, o último ganha).
    const { maplibre, mapa: m } = await criarMapaBase({
      container,
      styleUrl: 'https://tiles.openfreemap.org/styles/positron',
      zoom: 15,
      navControl: { visualizePitch: false }
    });
    maplibreRef = maplibre;
    mapa = m;
    carregamento = estadoCarregamentoMapa(mapa);

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

      // Sem polígono de quadra (ex: mini-mapa de endereços de um TCE) — ajusta
      // o zoom pra caber todos os pinos em vez do centro fixo default.
      if (!quadraGeo) {
        const pontos = locais
          .map((l) => (l as any).geo_geojson?.coordinates)
          .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);
        if (pontos.length > 0) {
          try {
            const bounds = pontos.reduce(
              (b: any, c) => b.extend(c as any),
              new maplibre.LngLatBounds(pontos[0], pontos[0])
            );
            mapa.fitBounds(bounds, { padding: 50, duration: 0, maxZoom: 17 });
          } catch (e) {
            console.warn('fit bounds (pontos):', e);
          }
        }
      }

      // Dispara o $effect abaixo, que desenha os pinos (e redesenha
      // sempre que `locais`/`numeroPorLocal` mudarem depois).
      mapaPronto = true;

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
    carregamento?.destruir();
    if (mapa) {
      try { mapa.remove(); } catch {}
      mapa = null;
    }
  });
</script>

<div class="relative">
  <div
    bind:this={container}
    class="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
    style:height={altura + 'px'}
  ></div>
  {#if carregamento?.carregando}
    <MapaCarregando demorando={carregamento.demorando} travado={carregamento.travado} />
  {/if}
</div>
