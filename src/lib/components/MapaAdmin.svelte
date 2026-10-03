<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { criarMapaBase, estadoCarregamentoMapa } from '$lib/mapa-base.svelte';
  import { urlBasemap, trocarBasemap, ancoraAbaixoDosRotulos, type Basemap } from '$lib/mapa-estilos';
  import MapaCarregando from '$lib/components/MapaCarregando.svelte';
  import { onMount, onDestroy } from 'svelte';
  import type { QuadraGeo } from '$lib/server/queries';
  import { diasDesde } from '$lib/utils/data';

  type ColorirPor = 'conclusao' | 'territorio' | 'densidade_enderecos' | 'densidade_residencias' | 'campanha';

  let {
    quadras,
    altura = 600,
    colorirPor = 'conclusao',
    mostrarRotulos = true,
    mostrarTerritorios = false,
    quadrasAlocadas = [],
    reservadasIds = [],
    concluidasCampanha = [],
    selecionadas = $bindable(new Set<string>()),
    basemap = $bindable<Basemap>('bright'),
    onClick,
    onLongPress,
    modoRuas = false
  }: {
    quadras: QuadraGeo[];
    altura?: number;
    colorirPor?: ColorirPor;
    mostrarRotulos?: boolean;
    mostrarTerritorios?: boolean;
    quadrasAlocadas?: string[];
    reservadasIds?: string[];
    concluidasCampanha?: string[];
    selecionadas?: Set<string>;
    basemap?: Basemap;
    onClick?: (q: QuadraGeo, multi: boolean) => void;
    onLongPress?: (q: QuadraGeo) => void;
    /** "Modo ruas": preenchimento quase transparente e contorno fino,
     *  pra ler o nome das ruas (pedido de dirigente: "às vezes fica
     *  difícil ver o nome da rua com essas linhas coloridas na frente") */
    modoRuas?: boolean;
  } = $props();

  // Pintura das quadras nos dois modos. No modo ruas a cor de status
  // continua lá, só bem fraca — dá pra saber o que está feito sem
  // esconder o mapa de fundo.
  function pinturaQuadras(ruas: boolean) {
    return ruas
      ? { fill: 0.12, halo: 0, linha: 1.2 }
      : { fill: 0.5, halo: 0.6, linha: 2.5 };
  }

  let container: HTMLDivElement;
  let mapa = $state<any>(null);
  let maplibreRef: any = null;
  let userMarker: any = null;
  let watchId: number | null = null;
  let carregamento: ReturnType<typeof estadoCarregamentoMapa> | null = $state(null);

  // Expõe getCanvas pra export PNG
  export function exportarPng(): string | null {
    if (!mapa) return null;
    try { return mapa.getCanvas().toDataURL('image/png'); } catch { return null; }
  }

  // Keys primitivos pro $effect rastrear mudança (Svelte 5 não detecta mutação de Set)
  const selKey = $derived([...selecionadas].sort().join('|'));
  const alocadasKey = $derived([...quadrasAlocadas].sort().join('|'));
  const concluidasCampanhaKey = $derived([...concluidasCampanha].sort().join('|'));

  // CRÍTICO: leia TODAS as deps reativas ANTES de qualquer guard.
  // Senão o early-return na 1ª execução (mapa=null) impede o tracking.
  $effect(() => {
    const k = selKey + alocadasKey + colorirPor; // força tracking
    void k;
    // Densidade recalcula os degraus de cor a partir de `quadras` (ver
    // stopsDensidade) — precisa reler quando os dados mudam, não só
    // quando o modo/seleção mudam.
    void quadras;
    if (!mapa || !mapa.getLayer('quadras-fill')) return;
    const expr = buildFillExpr(colorirPor, selecionadas, new Set(quadrasAlocadas));
    mapa.setPaintProperty('quadras-fill', 'fill-color', expr);
  });

  $effect(() => {
    const v = mostrarRotulos; // tracking explícito
    if (!mapa || !mapa.getLayer('quadras-label')) return;
    mapa.setLayoutProperty('quadras-label', 'visibility', v ? 'visible' : 'none');
  });

  $effect(() => {
    const p = pinturaQuadras(modoRuas); // tracking ANTES do guard
    if (!mapa || !mapa.getLayer('quadras-fill')) return;
    mapa.setPaintProperty('quadras-fill', 'fill-opacity', p.fill);
    mapa.setPaintProperty('quadras-line-halo', 'line-opacity', p.halo);
    mapa.setPaintProperty('quadras-line', 'line-width', p.linha);
  });

  let basemapAtual: Basemap | null = null;
  $effect(() => {
    const b = basemap; // tracking explícito antes do guard
    if (!mapa) return;
    if (basemapAtual === b) return;
    basemapAtual = b;
    trocarBasemap(mapa, b);
  });

  // Quando os dados (quadras / alocadas) mudam, atualiza a fonte GeoJSON.
  // Sem isso, "Concluir quadra" não repintava nada no mapa.
  $effect(() => {
    void quadras; void quadrasAlocadas; void reservadasIds; void concluidasCampanhaKey;
    if (!mapa || !mapa.getSource || !mapa.getSource('quadras')) return;
    const concluidasCampanhaSet = new Set(concluidasCampanha);
    const features = quadras
      .filter((q) => q.poly_geojson)
      .map((q) => {
        const dias = q.data_conclusao ? diasDesde(q.data_conclusao) : -1;
        return {
          type: 'Feature' as const,
          geometry: q.poly_geojson as any,
          properties: {
            id: q.id,
            color: q.color,
            status: q.status,
            ativa: q.ativa,
            concluida: !!q.data_conclusao,
            territorio_id: q.territorio_id,
            qtd_locais: q.qtd_locais,
            qtd_unidades: q.qtd_unidades,
            data_conclusao: q.data_conclusao,
            dias_concluido: dias,
            concluida_na_campanha: concluidasCampanhaSet.has(q.id)
          }
        } as any;
      });
    mapa.getSource('quadras').setData({ type: 'FeatureCollection', features } as any);

    if (mapa.getSource('alocadas')) {
      const alSet = new Set(quadrasAlocadas);
      const alFeatures = quadras
        .filter((q) => q.poly_geojson && alSet.has(q.id))
        .map((q) => ({
          type: 'Feature' as const,
          geometry: q.poly_geojson as any,
          properties: { id: q.id }
        }));
      mapa.getSource('alocadas').setData({ type: 'FeatureCollection', features: alFeatures } as any);
    }
    if (mapa.getSource('reservadas')) {
      const resSet = new Set(reservadasIds);
      const resFeatures = quadras
        .filter((q) => q.poly_geojson && resSet.has(q.id))
        .map((q) => ({
          type: 'Feature' as const,
          geometry: q.poly_geojson as any,
          properties: { id: q.id }
        }));
      mapa.getSource('reservadas').setData({ type: 'FeatureCollection', features: resFeatures } as any);
    }
  });

  // Densidade (endereços/residências): os limiares fixos (0/5/15/30/60)
  // foram calibrados olhando pra um bairro de casas — numa área de prédios
  // (dezenas de unidades por quadra) tudo passava de 60 e virava um mapa
  // inteiro da mesma cor mais forte, "não funcionando" visualmente (bug
  // reportado: "densidade/residências não tá funcionando"). Em vez de
  // limiar fixo, calcula os 5 degraus como frações do MAIOR valor real
  // presente nas quadras atuais — se adapta a qualquer congregação/bairro,
  // não só à que serviu de referência original.
  function stopsDensidade(valores: number[]): number[] {
    const max = valores.length > 0 ? Math.max(...valores) : 0;
    if (max <= 4) return [0, 1, 2, 3, Math.max(max, 4)]; // território minúsculo: degraus de 1 em 1
    const brutos = [0, max * 0.15, max * 0.35, max * 0.6, max];
    const stops: number[] = [];
    for (const v of brutos) {
      const r = Math.round(v);
      stops.push(stops.length > 0 && r <= stops[stops.length - 1] ? stops[stops.length - 1] + 1 : r);
    }
    return stops;
  }

  function buildFillExpr(modo: ColorirPor, sel: Set<string>, alocadas: Set<string>): any {
    // Default por modo
    let defaultColor: any;
    if (modo === 'conclusao') {
      // Fundiu status+idade (A24) — só existia distinção artificial entre
      // "status" (nunca=âmbar) e "idade" (nunca=cinza); manter uma só leitura.
      // Ativa/inativa é real; "feita ou não" usa a RECÊNCIA da conclusão
      // (igual ao Registro): nunca = âmbar (a fazer), feita há pouco = verde,
      // há muito = vermelho. Inativa = cinza escuro distinto.
      defaultColor = [
        'case',
        ['!', ['get', 'ativa']], 'rgba(100,116,139,0.4)',
        ['<', ['get', 'dias_concluido'], 0], 'rgba(245,158,11,0.45)',
        [
          'interpolate', ['linear'], ['get', 'dias_concluido'],
          0, 'rgba(34,197,94,0.55)',
          15, 'rgba(132,204,22,0.55)',
          30, 'rgba(250,204,21,0.55)',
          60, 'rgba(249,115,22,0.55)',
          90, 'rgba(220,38,38,0.6)'
        ]
      ];
    } else if (modo === 'territorio') {
      defaultColor = ['get', 'color'];
    } else if (modo === 'densidade_enderecos') {
      const [s0, s1, s2, s3, s4] = stopsDensidade(quadras.map((q) => q.qtd_locais));
      defaultColor = [
        'interpolate', ['linear'], ['get', 'qtd_locais'],
        s0, '#fef3c7', s1, '#fde68a', s2, '#fcd34d', s3, '#f59e0b', s4, '#dc2626'
      ];
    } else if (modo === 'densidade_residencias') {
      const [s0, s1, s2, s3, s4] = stopsDensidade(quadras.map((q) => q.qtd_unidades));
      defaultColor = [
        'interpolate', ['linear'], ['get', 'qtd_unidades'],
        s0, '#fef3c7', s1, '#fde68a', s2, '#fcd34d', s3, '#f59e0b', s4, '#dc2626'
      ];
    } else if (modo === 'campanha') {
      // "Só a campanha": ignora histórico anterior — concluída no período =
      // verde forte, todo o resto = cinza (sem vazar recência antiga).
      defaultColor = [
        'case',
        ['get', 'concluida_na_campanha'], 'rgba(21,128,61,0.75)',
        'rgba(148,163,184,0.35)'
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
    const { maplibre, mapa: m } = await criarMapaBase({
      container,
      styleUrl: urlBasemap(basemap),
      zoom: 14,
      extra: { preserveDrawingBuffer: true }
    });
    maplibreRef = maplibre;
    mapa = m;
    carregamento = estadoCarregamentoMapa(mapa);

    function setupCamadas() {
      if (!mapa.getStyle()) return; // style ainda não pronto
      if (mapa.getLayer('quadras-fill')) return; // já setupado
      const concluidasCampanhaSet = new Set(concluidasCampanha);
      const features = quadras
        .filter((q) => q.poly_geojson)
        .map((q) => {
          const dias = q.data_conclusao ? diasDesde(q.data_conclusao) : -1;
          return {
            type: 'Feature' as const,
            geometry: q.poly_geojson as any,
            properties: {
              id: q.id,
              color: q.color,
              status: q.status,
              ativa: q.ativa,
              concluida: !!q.data_conclusao,
              territorio_id: q.territorio_id,
              qtd_locais: q.qtd_locais,
              // CRÍTICO: precisa estar aqui também, não só no $effect de
              // atualização — senão o modo "densidade (residências)" lê
              // ['get','qtd_unidades'] => null no setup inicial e o
              // interpolate renderiza tudo da mesma cor (bug: mapa de
              // residências saía todo cinza). O $effect de setData só
              // re-roda quando uma dep reativa muda, não depois que o
              // style-load (async) chama setupCamadas — então o feature
              // set inicial, sem qtd_unidades, ficava valendo.
              qtd_unidades: q.qtd_unidades,
              data_conclusao: q.data_conclusao,
              dias_concluido: dias,
              concluida_na_campanha: concluidasCampanhaSet.has(q.id)
            }
          };
        });

      mapa.addSource('quadras', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features } as any
      });

      // Preenchimento e contornos entram ABAIXO dos rótulos do mapa de
      // fundo — nome de rua e de comércio ficam sempre por cima das
      // quadras. Antes eram empilhados no topo e o laranja a 50% + a
      // borda de 2,5px apagavam justamente o nome das ruas (queixa real
      // de dirigente). Os NOSSOS rótulos (id da quadra, cadeado,
      // tracejado de campanha) continuam no topo. Ver
      // ancoraAbaixoDosRotulos: não é "antes do primeiro texto" (no
      // Liberty isso jogaria as quadras pra baixo dos prédios).
      const primeiroRotuloDoFundo = ancoraAbaixoDosRotulos(mapa.getStyle()?.layers);
      const pint = pinturaQuadras(modoRuas);

      mapa.addLayer(
        {
          id: 'quadras-fill',
          type: 'fill',
          source: 'quadras',
          paint: {
            'fill-color': buildFillExpr(colorirPor, selecionadas, new Set(quadrasAlocadas)),
            'fill-opacity': pint.fill
          }
        },
        primeiroRotuloDoFundo
      );

      // Halo neutro por baixo da borda colorida: como quadras.color já é
      // sincronizado com a cor do território (poligonos/+page.server.ts),
      // essa borda JÁ diferencia território — só que 2px fino se perde
      // contra preenchimentos fortes (recência/densidade). O halo dá
      // contraste sem mudar a cor em si.
      mapa.addLayer(
        {
          id: 'quadras-line-halo',
          type: 'line',
          source: 'quadras',
          paint: {
            'line-color': '#ffffff',
            'line-width': 4.5,
            'line-opacity': pint.halo
          }
        },
        primeiroRotuloDoFundo
      );

      mapa.addLayer(
        {
          id: 'quadras-line',
          type: 'line',
          source: 'quadras',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': pint.linha
          }
        },
        primeiroRotuloDoFundo
      );

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

      // Camadas GL 'symbol' só suportam glifo de fonte (não dá pra montar um
      // <Icon> lucide aqui como nos HTML Markers de POI) — emoji é a opção
      // válida nesse caso pontual (mapa permite, diferente da UI geral).
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

      // Quadras reservadas pra campanha — contorno tracejado roxo por cima
      const reservadasFeatures = quadras
        .filter((q) => q.poly_geojson && reservadasIds.includes(q.id))
        .map((q) => ({
          type: 'Feature' as const,
          geometry: (q.poly_geojson as any),
          properties: { id: q.id }
        }));
      mapa.addSource('reservadas', { type: 'geojson', data: { type: 'FeatureCollection', features: reservadasFeatures } as any });
      mapa.addLayer({
        id: 'reservadas-line',
        type: 'line',
        source: 'reservadas',
        paint: {
          'line-color': '#9333ea',
          'line-width': 3,
          'line-dasharray': [2, 1.5]
        }
      });
    }

    // Re-setup das camadas após cada troca de style (incluindo a primeira).
    // Se o style já tá carregado quando registramos, dispara manualmente.
    mapa.on('style.load', setupCamadas);
    if (mapa.isStyleLoaded()) setupCamadas();

    mapa.on('load', () => {
      // garantia adicional caso 'style.load' tenha sido perdido
      setupCamadas();

      // Click — multi-seleção se shift/ctrl, ou se já tem seleção
      let pressStart: number | null = null;
      let pressTimer: any = null;
      let pressTarget: string | null = null;
      let pressPonto: { x: number; y: number } | null = null;

      // QUEIXA REAL de dirigente: "quando mexe no mapa sobe muito rápido
      // essa janela". O timer era armado no touchstart sobre a quadra e
      // só cancelado no touchend DA CAMADA — arrastar o mapa com o dedo
      // começando em cima de uma quadra deixava o timer correndo (e, se o
      // dedo saísse da quadra, o touchend da camada nem disparava), então
      // o painel abria no meio do arrasto. Agora QUALQUER movimento
      // cancela: dedo andando mais de 10px, e os eventos do próprio mapa
      // (movestart/dragstart/zoomstart/rotatestart cobrem pinça e
      // inércia). E sem onLongPress (painel desligado na toolbar) o
      // timer nem é armado.
      const cancelarPress = () => {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressPonto = null;
      };
      const armarPress = (e: any) => {
        pressStart = Date.now();
        if (!onLongPress) return;
        pressTarget = e.features?.[0]?.properties?.id;
        pressPonto = e.point ? { x: e.point.x, y: e.point.y } : null;
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          pressTimer = null;
          pressPonto = null;
          if (pressTarget && onLongPress) {
            const q = quadras.find((x) => x.id === pressTarget);
            if (q) onLongPress(q);
          }
        }, 600);
      };
      const cancelarSeMoveu = (e: any) => {
        if (!pressTimer || !pressPonto || !e.point) return;
        if (Math.hypot(e.point.x - pressPonto.x, e.point.y - pressPonto.y) > 10) {
          cancelarPress();
          pressStart = null; // arrasto não é clique nem toque longo
        }
      };

      mapa.on('mousedown', 'quadras-fill', armarPress);
      mapa.on('touchstart', 'quadras-fill', armarPress);
      // Fim do toque/clique em QUALQUER lugar (não só sobre a quadra)
      mapa.on('mouseup', cancelarPress);
      mapa.on('touchend', cancelarPress);
      mapa.on('touchcancel', cancelarPress);
      mapa.on('mousemove', cancelarSeMoveu);
      mapa.on('touchmove', cancelarSeMoveu);
      for (const ev of ['movestart', 'dragstart', 'zoomstart', 'rotatestart']) {
        mapa.on(ev, () => {
          cancelarPress();
          pressStart = null;
        });
      }

      mapa.on('click', 'quadras-fill', (e: any) => {
        cancelarPress();
        if (pressStart && Date.now() - pressStart > 500) return; // long-press handled
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const q = (quadras ?? []).find((x) => x.id === props.id);
        if (!q) return;
        // Mostra popup persistente (com X pra fechar) — útil em mobile sem hover
        mostrarPopup(q, e.lngLat, true);
        const multi = !!e.originalEvent?.shiftKey || !!e.originalEvent?.metaKey || selecionadas.size > 0;
        if (onClick) onClick(q, multi);
      });
      // Tooltip com ID + território + última conclusão (humanizada)
      function dataBR(s: string): string {
        const [y, m, d] = s.split('-');
        return d && m && y ? `${d}/${m}/${y}` : s;
      }
      function tempoRelativo(diasRaw: number): string {
        const dias = Math.max(0, diasRaw);
        if (dias === 0) return 'hoje';
        if (dias === 1) return 'ontem';
        if (dias < 30) return `há ${dias} dias`;
        if (dias < 60) return 'há 1 mês';
        if (dias < 365) return `há ${Math.round(dias / 30)} meses`;
        const anos = Math.floor(dias / 365);
        return anos === 1 ? 'há 1 ano' : `há ${anos} anos`;
      }
      function corDias(dias: number | null): string {
        if (dias == null) return '#64748b';
        if (dias < 30) return '#16a34a';
        if (dias < 90) return '#ca8a04';
        if (dias < 180) return '#ea580c';
        return '#dc2626';
      }
      function buildPopupHtml(q: any): string {
        const dias = q.data_conclusao ? diasDesde(q.data_conclusao) : null;
        const territorioLabel = q.territorio_nome
          ? (/^\d+$/.test(q.territorio_nome) ? `Território ${q.territorio_nome}` : q.territorio_nome)
          : null;
        return `<div style="font:13px system-ui; min-width:160px;">
          <div style="font-weight:700; font-size:15px; margin-bottom:2px;">${q.id}</div>
          ${territorioLabel ? `<div style="color:#64748b; font-size:11px;">${territorioLabel}</div>` : ''}
          <div style="color:#475569; font-size:11px; margin-top:2px;">${q.qtd_locais} endereço${q.qtd_locais === 1 ? '' : 's'}</div>
          <div style="margin-top:6px; padding-top:6px; border-top:1px solid #e2e8f0;">
            ${dias == null
              ? `<div style="color:#94a3b8; font-size:11px; font-style:italic;">nunca concluída</div>`
              : `<div style="color:${corDias(dias)}; font-size:12px; font-weight:600;">${tempoRelativo(dias)}</div>
                 <div style="color:#94a3b8; font-size:10px;">${dataBR(q.data_conclusao!)}</div>`
            }
          </div>
        </div>`;
      }

      let popup: any = null;
      let popupClicado = false; // popup do click persiste até outro click ou esc
      let popupQuadraId: string | null = null; // qual quadra o popup tá mostrando agora
      function mostrarPopup(q: any, lngLat: any, fromClick: boolean) {
        if (popup) popup.remove();
        popup = new maplibreRef.Popup({
          closeButton: fromClick,
          closeOnClick: false,
          offset: 8
        }).setLngLat(lngLat).setHTML(buildPopupHtml(q)).addTo(mapa);
        popupClicado = fromClick;
        popupQuadraId = q.id;
        if (fromClick) {
          popup.on('close', () => { popupClicado = false; popup = null; popupQuadraId = null; });
        }
      }

      mapa.on('mouseenter', 'quadras-fill', (e: any) => {
        mapa.getCanvas().style.cursor = 'pointer';
        if (popupClicado) return; // não substitui popup pinado por click
        const props = e.features?.[0]?.properties;
        if (!props) return;
        const q = (quadras ?? []).find((x) => x.id === props.id);
        if (q) mostrarPopup(q, e.lngLat, false);
      });
      // Mousemove dentro da camada — troca o conteúdo quando o cursor passa
      // de uma quadra pra outra (mouseenter/mouseleave são por LAYER, não por feature)
      mapa.on('mousemove', 'quadras-fill', (e: any) => {
        if (popupClicado) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        if (props.id !== popupQuadraId) {
          // Mudou de quadra → atualiza HTML
          const q = (quadras ?? []).find((x) => x.id === props.id);
          if (q && popup) {
            popup.setHTML(buildPopupHtml(q));
            popupQuadraId = q.id;
          }
        }
        if (popup) popup.setLngLat(e.lngLat);
      });
      mapa.on('mouseleave', 'quadras-fill', () => {
        mapa.getCanvas().style.cursor = '';
        if (popup && !popupClicado) { popup.remove(); popup = null; popupQuadraId = null; }
      });

      // Fit bounds em todas
      try {
        let bounds: any = null;
        for (const q of quadras) {
          if (!q.poly_geojson) continue;
          const coords = (q.poly_geojson as any).coordinates?.[0] || [];
          for (const c of coords) {
            if (!bounds) bounds = new maplibreRef.LngLatBounds(c as any, c as any);
            else bounds.extend(c as any);
          }
        }
        if (bounds) mapa.fitBounds(bounds, { padding: 30, duration: 0 });
      } catch {}

      // GPS
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          if (!userMarker) {
            const el = document.createElement('div');
            el.style.cssText = `width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(37,99,235,.3)`;
            userMarker = new maplibreRef.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(mapa);
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
</div>
