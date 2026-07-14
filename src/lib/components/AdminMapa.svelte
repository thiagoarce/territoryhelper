<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { criarMapaBase, estadoCarregamentoMapa } from '$lib/mapa-base.svelte';
  import MapaCarregando from '$lib/components/MapaCarregando.svelte';
  import { onMount, onDestroy, mount } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';
  import { diasDesde } from '$lib/utils/data';
  import Icon, { type NomeIcone } from '$lib/ui/Icon.svelte';

  interface POI {
    id: string;
    lat: number;
    lng: number;
    nome: string;
    icone: NomeIcone;
    url?: string;
  }

  type Basemap = 'positron' | 'liberty' | 'bright';
  const BASEMAPS: Record<Basemap, string> = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright'
  };

  let {
    quadras,
    altura = 600,
    onQuadraClick,
    colorirPor = 'status',
    destacarIds = [],
    selecionadasIds = [],
    pois = [],
    legenda = true,
    basemap = 'positron',
    popupDetalhe = false
  }: {
    quadras: QuadraGeo[];
    altura?: number;
    onQuadraClick?: (q: QuadraGeo) => void;
    // 'status' (pendente/concluída/inativa), 'recencia' (vermelho <15d,
    // laranja 15–45d, verde trabalhável, cinza inativa — visão do dirigente),
    // 'territorio' (cor própria de cada território), 'densidade_enderecos'
    // (nº de locais) ou 'densidade_residencias' (nº de unidades, A3).
    colorirPor?: 'status' | 'recencia' | 'territorio' | 'densidade_enderecos' | 'densidade_residencias';
    // Quadras com borda grossa escura (ex.: designadas ao dirigente logado)
    destacarIds?: string[];
    // Quadras selecionadas no modo multi-seleção (borda azul grossa)
    selecionadasIds?: string[];
    pois?: POI[];
    // Legenda de cor no canto — desliga só se o chamador já explica as cores em outro lugar.
    legenda?: boolean;
    // Preferência de estilo (profile.pref_basemap) — default 'positron' pra visitante anônimo (t/[token]).
    basemap?: Basemap;
    // A13: clique abre popup read-only de detalhe (nome/território/última
    // conclusão/contagens) em vez de disparar onQuadraClick — visão geral
    // do dirigente não tem ação nenhuma no mapa.
    popupDetalhe?: boolean;
  } = $props();

  // Itens da legenda batendo com o fillColor calculado mais abaixo.
  const legendaItens = $derived.by(() => {
    if (colorirPor === 'densidade_enderecos') {
      return [{ cor: 'linear-gradient(90deg, #fef3c7, #dc2626)', label: 'Poucos → muitos endereços' }];
    }
    if (colorirPor === 'densidade_residencias') {
      return [{ cor: 'linear-gradient(90deg, #fef3c7, #dc2626)', label: 'Poucas → muitas residências' }];
    }
    if (colorirPor === 'territorio') {
      return [{ cor: 'linear-gradient(90deg, #94a3b8, #64748b)', label: 'Cor própria de cada território' }];
    }
    if (colorirPor === 'recencia') {
      return [
        { cor: 'rgba(220, 38, 38, 0.75)', label: 'Concluída há <15 dias' },
        { cor: 'rgba(245, 158, 11, 0.7)', label: 'Concluída há 15–45 dias' },
        { cor: 'rgba(34, 197, 94, 0.6)', label: 'Livre pra trabalhar' },
        { cor: 'rgba(148, 163, 184, 0.5)', label: 'Inativa' }
      ];
    }
    return [
      { cor: 'rgba(34, 197, 94, 0.6)', label: 'Concluída' },
      { cor: 'rgba(245, 158, 11, 0.6)', label: 'Pendente' },
      { cor: 'rgba(148, 163, 184, 0.5)', label: 'Inativa' }
    ];
  });

  let container: HTMLDivElement;
  let mapa: any = null;
  let carregamento: ReturnType<typeof estadoCarregamentoMapa> | null = $state(null);
  let carregado = $state(false);
  let userMarker: any = null;
  let watchId: number | null = null;
  let poiMarkers: any[] = [];
  let maplibreRef: any = null;
  let basemapAtual: Basemap | null = null;

  $effect(() => {
    const b = basemap; // tracking explícito antes do guard
    const ok = carregado;
    if (!ok || !mapa) return;
    if (basemapAtual === null) { basemapAtual = b; return; } // já nasceu com esse estilo
    if (basemapAtual === b) return;
    basemapAtual = b;
    try { mapa.setStyle(BASEMAPS[b]); } catch {}
  });

  // Bucket de recência calculado em JS (MapLibre não faz date-diff)
  function bucketRecencia(q: QuadraGeo): string {
    if (!q.ativa) return 'inativa';
    if (!q.data_conclusao) return 'livre';
    const dias = diasDesde(q.data_conclusao);
    if (dias < 15) return 'recente';
    if (dias < 45) return 'medio';
    return 'livre';
  }

  // Expõe o canvas pra screenshot. Chamado de fora via bind:this.
  // WebGL: toDataURL fora do frame de render devolve canvas PRETO —
  // força um repaint e captura dentro do evento 'render'.
  export function exportarPng(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!mapa) return resolve(null);
      let resolvido = false;
      const capturar = () => {
        if (resolvido) return;
        resolvido = true;
        try {
          resolve(mapa.getCanvas().toDataURL('image/png'));
        } catch (e) {
          console.warn('exportar png falhou:', e);
          resolve(null);
        }
      };
      try {
        mapa.once('render', capturar);
        mapa.triggerRepaint();
        // fallback se o evento não disparar (mapa parado sem repaint)
        setTimeout(capturar, 1500);
      } catch {
        capturar();
      }
    });
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

  // Atualiza filtros das camadas de destaque/seleção quando os props mudam.
  // deps lidas ANTES do early-return (regra dos runes).
  $effect(() => {
    const ids = [...destacarIds];
    const ok = carregado;
    if (!ok || !mapa) return;
    try { mapa.setFilter('quadras-destaque', ['in', ['get', 'id'], ['literal', ids]]); } catch {}
  });
  $effect(() => {
    const ids = [...selecionadasIds];
    const ok = carregado;
    if (!ok || !mapa) return;
    try { mapa.setFilter('quadras-sel', ['in', ['get', 'id'], ['literal', ids]]); } catch {}
  });

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
      el.style.cssText = 'width:32px;height:32px;border-radius:50%;background:white;border:2px solid #2563eb;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;color:#2563eb;display:flex;align-items:center;justify-content:center;padding:0;';
      mount(Icon, { target: el, props: { nome: p.icone, size: 18 } });
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

  function buildFillExpr(modo: typeof colorirPor): any {
    if (modo === 'densidade_enderecos') {
      return [
        'interpolate', ['linear'], ['get', 'qtd_locais'],
        0, '#fef3c7', 5, '#fde68a', 15, '#fcd34d', 30, '#f59e0b', 60, '#dc2626'
      ];
    }
    if (modo === 'densidade_residencias') {
      return [
        'interpolate', ['linear'], ['get', 'qtd_unidades'],
        0, '#fef3c7', 5, '#fde68a', 15, '#fcd34d', 30, '#f59e0b', 60, '#dc2626'
      ];
    }
    if (modo === 'territorio') return ['get', 'color'];
    if (modo === 'recencia') {
      return [
        'match',
        ['get', 'recencia'],
        'recente', 'rgba(220, 38, 38, 0.55)',   // vermelho: concluída <15d — não trabalhar
        'medio', 'rgba(245, 158, 11, 0.5)',      // laranja: 15–45d — evitar
        'inativa', 'rgba(148, 163, 184, 0.3)',   // cinza: inativa
        'rgba(34, 197, 94, 0.4)'                 // verde: livre pra trabalhar
      ];
    }
    return [
      'match',
      ['get', 'status'],
      'concluido', STATUS_COLORS.concluido,
      'inativa', STATUS_COLORS.inativa,
      STATUS_COLORS.pendente
    ];
  }

  // Recolore ao trocar o seletor (A13) — sem isso o mapa só pintava certo
  // no modo em que nasceu, já que o fill era calculado só dentro do 'load'.
  $effect(() => {
    const modo = colorirPor; // tracking explícito antes do guard
    const ok = carregado;
    if (!ok || !mapa || !mapa.getLayer('quadras-fill')) return;
    try { mapa.setPaintProperty('quadras-fill', 'fill-color', buildFillExpr(modo)); } catch {}
  });

  onMount(async () => {
    const { maplibre, mapa: m } = await criarMapaBase({
      container,
      styleUrl: BASEMAPS[basemap] ?? BASEMAPS.positron,
      zoom: 14,
      // habilita screenshot via toDataURL (perf negligível pra este uso)
      extra: { preserveDrawingBuffer: true }
    });
    maplibreRef = maplibre;
    mapa = m;
    carregamento = estadoCarregamentoMapa(mapa);

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
            territorio_nome: q.territorio_nome,
            qtd_locais: q.qtd_locais,
            qtd_unidades: q.qtd_unidades,
            data_conclusao: q.data_conclusao,
            recencia: bucketRecencia(q)
          }
        }));

      mapa.addSource('quadras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features } as any
      });

      mapa.addLayer({
        id: 'quadras-fill',
        type: 'fill',
        source: 'quadras',
        paint: { 'fill-color': buildFillExpr(colorirPor), 'fill-opacity': 0.45 }
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

      // Destaque (minhas quadras): borda grossa escura, atualizada via $effect
      mapa.addLayer({
        id: 'quadras-destaque',
        type: 'line',
        source: 'quadras',
        filter: ['in', ['get', 'id'], ['literal', []]],
        paint: { 'line-color': '#0f172a', 'line-width': 4 }
      });

      // Seleção (modo multi-seleção): borda azul mais grossa por cima
      mapa.addLayer({
        id: 'quadras-sel',
        type: 'line',
        source: 'quadras',
        filter: ['in', ['get', 'id'], ['literal', []]],
        paint: { 'line-color': '#2563eb', 'line-width': 5 }
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

      carregado = true;

      // Click handler — modo ação (onQuadraClick) OU modo popup read-only (A13)
      mapa.on('click', 'quadras-fill', (e: any) => {
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (popupDetalhe) {
          const dataFmt = props.data_conclusao
            ? new Date(props.data_conclusao + 'T12:00:00').toLocaleDateString('pt-BR')
            : 'nunca concluída';
          const html = `
            <div style="font-size:13px;line-height:1.5;min-width:160px;">
              <div style="font-weight:600;font-family:monospace;">${props.id}</div>
              <div>Território: ${props.territorio_nome ?? '—'}</div>
              <div>Última conclusão: ${dataFmt}</div>
              <div>${props.qtd_locais ?? 0} endereço(s) · ${props.qtd_unidades ?? 0} residência(s)</div>
            </div>
          `;
          new maplibreRef.Popup({ closeButton: true, maxWidth: '240px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(mapa);
          return;
        }
        if (!onQuadraClick) return;
        const q = quadras.find((x) => x.id === props.id);
        if (q) onQuadraClick(q);
      });
      mapa.on('mouseenter', 'quadras-fill', () => { mapa.getCanvas().style.cursor = 'pointer'; });
      mapa.on('mouseleave', 'quadras-fill', () => { mapa.getCanvas().style.cursor = ''; });

      // Fit bounds em quadras + pois (página pública pode ter só prédios)
      try {
        let bounds: any = null;
        for (const f of features) {
          const coords = (f.geometry as any).coordinates?.[0] || [];
          for (const c of coords) {
            if (!bounds) bounds = new maplibre.LngLatBounds(c as any, c as any);
            else bounds.extend(c as any);
          }
        }
        for (const p of pois) {
          const c: [number, number] = [p.lng, p.lat];
          if (!bounds) bounds = new maplibre.LngLatBounds(c, c);
          else bounds.extend(c);
        }
        if (bounds) mapa.fitBounds(bounds, { padding: 40, duration: 0, maxZoom: 16 });
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
    carregamento?.destruir();
    if (mapa) try { mapa.remove(); } catch {}
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

  {#if legenda && carregado}
    <div class="absolute bottom-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm px-2 py-1.5 text-[11px] space-y-1 pointer-events-none">
      {#each legendaItens as item}
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style:background={item.cor}></span>
          <span class="text-slate-600">{item.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
