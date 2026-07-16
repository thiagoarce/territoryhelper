<script lang="ts">
  // E1: gera o "Cartão de Mapa de Território" (formato do S-12-T) como
  // PNG, 100% no browser. Um mapa MapLibre PRÓPRIO e oculto renderiza as
  // quadras do CONTEXTO (todos os territórios afetados) com a regra:
  // cinza = disponível, vermelho+✕ = concluída dentro do limiar,
  // destaque = quadras do token ("designadas para o dia"). Depois um
  // canvas 2D compõe o cartão (título/Localidade/Terr. N.º/rodapé) com o
  // PNG do mapa na área branca. O mapa é criado e destruído a cada
  // geração — mais lento (~2s), mas sem instância fantasma nem estado.
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { diasDesde } from '$lib/utils/data';
  import { centroidePoligono } from '$lib/utils/geo';
  import { buscarViasComNome, pontoDoRotulo, abreviarLogradouro, comprimentoMetros, type ViaComNome } from '$lib/utils/overpass';

  export interface QuadraContexto {
    id: string;
    territorio_id: string | null;
    data_conclusao: string | null;
    poly_geojson: unknown;
  }

  let {
    quadras,
    destaqueIds,
    modo = 'link',
    nomesTerritorios = {}
  }: {
    quadras: QuadraContexto[];
    destaqueIds: string[];
    /** 'link' = compartilhamento efêmero do dirigente (estado do dia:
     *  designadas/feitas há pouco/legenda — comportamento original).
     *  'arquivo' = cartão S-12 físico do lote: só o território, neutro,
     *  sem estado do dia; vizinhos viram SETA "TERRITÓRIO X →" na borda
     *  (como o cartão do app antigo) em vez de polígonos/letras. */
    modo?: 'link' | 'arquivo';
    /** id do território → nome (pras setas de vizinho no modo arquivo) */
    nomesTerritorios?: Record<string, string>;
  } = $props();

  // Mesmos estilos do resto do app (MapaAdmin) — redeclarado porque o
  // MapaAdmin não exporta a const.
  const BASEMAPS: Record<string, string> = {
    positron: 'https://tiles.openfreemap.org/styles/positron',
    liberty: 'https://tiles.openfreemap.org/styles/liberty',
    bright: 'https://tiles.openfreemap.org/styles/bright'
  };

  const CORES = {
    destaqueFill: '#4f46e5',
    destaqueLinha: '#312e81',
    recenteFill: '#dc2626',
    recenteLinha: '#991b1b',
    livreFill: '#94a3b8',
    livreLinha: '#64748b'
  };

  let containerMapa: HTMLDivElement;

  function bboxDeTudo(feats: any[]): [[number, number], [number, number]] | null {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const f of feats) {
      const anel = f.geometry?.coordinates?.[0] as [number, number][] | undefined;
      if (!anel) continue;
      for (const [lng, lat] of anel) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (!isFinite(minLng)) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
  }

  // Rótulo da quadra no cartão = SÓ a letra, sem o número do território.
  // As quadras têm id tipo "1A"/"1B".."1M" (território 1); repetir o "1"
  // em toda quadra polui o cartão e o número do território já aparece no
  // campo "Terr. N.º". Tira o prefixo do PRÓPRIO território da quadra
  // (cada quadra do contexto pode ser de um território diferente) — ex.:
  // "1A" no território "1" → "A", "29C" no "29" → "C". Fallback pro id
  // inteiro se não casar (território null, ou id que não começa com ele).
  function rotuloQuadra(id: string, territorioId: string | null): string {
    if (territorioId && id.startsWith(territorioId)) {
      const resto = id.slice(territorioId.length);
      // Só corta se o que sobra começa com NÃO-dígito ("1A"→"A"): uma
      // quadra hipotética "10" no território "1" viraria "0" — nesses
      // casos ambíguos fica o id inteiro, melhor verboso que errado.
      if (resto && !/^\d/.test(resto)) return resto;
    }
    return id;
  }

  async function renderizarMapa(basemap: string, limiarDias: number): Promise<string | null> {
    const destaque = new Set(destaqueIds);
    // Modo arquivo: só as quadras do PRÓPRIO território viram polígono/
    // letra — o contexto (congregação inteira, no lote) poluía o cartão
    // com letras e cores de estado dos vizinhos, que não dizem nada num
    // cartão de arquivo. Vizinhos entram como seta na borda (ver abaixo).
    const fonteQuadras = modo === 'arquivo' ? quadras.filter((q) => destaque.has(q.id)) : quadras;
    const features = fonteQuadras
      .filter((q) => q.poly_geojson)
      .map((q) => ({
        type: 'Feature' as const,
        geometry: q.poly_geojson as any,
        properties: {
          id: q.id,
          rotulo: rotuloQuadra(q.id, q.territorio_id),
          estado: destaque.has(q.id)
            ? 'destaque'
            : q.data_conclusao && diasDesde(q.data_conclusao) <= limiarDias
              ? 'recente'
              : 'livre'
        }
      }));
    if (features.length === 0) return null;
    // Zoom no TERRITÓRIO (quadras destacadas), não no contexto inteiro —
    // bug real na impressão em lote: `quadras` ali é a congregação inteira
    // (pro contexto cinza ficar completo), então o bbox de TODAS as
    // features enquadrava o mapa geral em vez do território sendo
    // impresso. Cai pro bbox de tudo só se por algum motivo não houver
    // nenhuma quadra destacada.
    const featuresDestaque = features.filter((f) => f.properties.estado === 'destaque');
    const bbox = bboxDeTudo(featuresDestaque.length > 0 ? featuresDestaque : features);
    if (!bbox) return null;

    // Busca as vias com nome (Overpass) JÁ, em paralelo com a criação do
    // mapa/carregamento dos tiles — os dois são I/O, não precisa esperar
    // um pro outro começar. Bbox com folga de 25% (mín. ~150m) pra pegar
    // rua que corta perto da borda do território, não só as bem no meio.
    const [[minLng, minLat], [maxLng, maxLat]] = bbox;
    const folgaLat = Math.max((maxLat - minLat) * 0.25, 0.0015);
    const folgaLng = Math.max((maxLng - minLng) * 0.25, 0.0015);
    // Teto de 6s pro fetch de vias, MENOR que o timeout geral do cartão
    // (20s, abaixo) — buscarViasComNome tenta até 3 espelhos Overpass em
    // sequência internamente e cada um pode levar até 13s; sem esse
    // teto, os 3 fora do ar em sequência estourariam o timeout do
    // cartão INTEIRO antes mesmo de cair no fallback (regressão: cartão
    // que sempre funcionou — sem depender de rede externa nenhuma —
    // passaria a falhar quando só a Overpass estivesse fora).
    const viasPromise: Promise<ViaComNome[]> = Promise.race([
      buscarViasComNome({
        south: minLat - folgaLat,
        west: minLng - folgaLng,
        north: maxLat + folgaLat,
        east: maxLng + folgaLng
      }),
      new Promise<ViaComNome[]>((r) => setTimeout(() => r([]), 6000))
    ]).catch(() => [] as ViaComNome[]); // sem vias = cai no fallback do style (ver load abaixo)

    return new Promise((resolve) => {
      const map = new maplibregl.Map({
        container: containerMapa,
        style: BASEMAPS[basemap] ?? BASEMAPS.positron,
        bounds: bbox,
        fitBoundsOptions: { padding: 34 },
        attributionControl: false,
        interactive: false,
        ...({ preserveDrawingBuffer: true } as any)
      });
      const acabar = (png: string | null) => {
        try { map.remove(); } catch {}
        resolve(png);
      };
      // Sem tiles (offline/estilo fora do ar) o 'idle' pode nunca vir.
      const timeout = setTimeout(() => acabar(null), 20000);

      map.on('error', () => { /* tile faltando não aborta — o idle decide */ });
      map.on('load', async () => {
        // Nome de rua ilegível/ausente no cartão impresso era queixa real
        // (print comparado lado a lado com o cartão do app antigo).
        // Tentamos primeiro só ajustar a camada de nome de rua do PRÓPRIO
        // style (setLayerZoomRange/text-size) e não resolveu de verdade —
        // a geometria da via às vezes nem está presente no tile naquele
        // zoom (simplificação do tileset de terceiro, fora do nosso
        // controle) e o posicionamento sofre colisão com outras camadas.
        // Solução de verdade: desenhamos o nome NÓS MESMOS, como camada
        // própria, a partir de dados buscados na Overpass (mesma API já
        // usada em Estacionar perto — ver $lib/utils/overpass.ts). Texto
        // sempre aparece (allow-overlap), no tamanho que a gente escolhe.
        const vias = await viasPromise;
        const nomesStyle = ['highway-name-major', 'highway-name-minor', 'highway-name-path'];
        // Rótulo por TRECHO com nome (não mais "um por nome de rua"): a
        // dedup global deixava rua sem nome entre quadras (queixa real:
        // "entre B e C não apareceu a rua") — o rótulo único ficava em
        // outro pedaço da mesma rua. Cada trecho >= 45m vira um ponto
        // rotacionado (ver pontoDoRotulo: line-center só desenha texto
        // que CABE na linha na tela — em zoom de território nunca cabe);
        // a colisão do MapLibre + sort-key (trecho mais longo primeiro)
        // controlam a repetição ao longo da mesma rua.
        // Piso de 25m: rua "bem pequena" entre duas quadras (queixa real)
        // também merece nome — 45m cortava viela curta que existe de
        // verdade no território. Abaixo de 25m é conector/rotatória, aí
        // sim ruído.
        const rotulosVias = vias
          .filter((v) => v.nome && comprimentoMetros(v.pontos) >= 25)
          .map((v) => {
            const p = pontoDoRotulo(v.pontos);
            return p
              ? {
                  type: 'Feature' as const,
                  geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
                  properties: {
                    nome: abreviarLogradouro(v.nome!),
                    angulo: p.angulo,
                    ordem: Math.max(0, 10000 - Math.round(comprimentoMetros(v.pontos)))
                  }
                }
              : null;
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);
        if (vias.length > 0) {
          // Some com o rótulo do style pra não duplicar nome de rua.
          for (const layerId of nomesStyle) {
            try { map.setLayoutProperty(layerId, 'visibility', 'none'); } catch {}
          }
        } else {
          // Sem dado da Overpass (rede/serviço fora) — fallback: pelo
          // menos tenta destravar o rótulo nativo do style, melhor que
          // nada em vez de mapa totalmente sem nome de rua.
          for (const layerId of nomesStyle) {
            try {
              map.setLayerZoomRange(layerId, 0, 24);
              map.setLayoutProperty(layerId, 'text-size', 19);
              map.setPaintProperty(layerId, 'text-halo-width', 1.6);
            } catch {}
          }
        }

        map.addSource('cartao', { type: 'geojson', data: { type: 'FeatureCollection', features } });
        // Modo arquivo: quadra NEUTRA (fill leve + contorno escuro), como
        // o cartão físico do app antigo — cor de estado (azul designada/
        // vermelho recente) é informação do DIA, só faz sentido no link
        // efêmero do dirigente.
        map.addLayer({
          id: 'cartao-fill', type: 'fill', source: 'cartao',
          paint: modo === 'arquivo'
            ? { 'fill-color': '#94a3b8', 'fill-opacity': 0.14 }
            : {
                'fill-color': ['match', ['get', 'estado'],
                  'destaque', CORES.destaqueFill,
                  'recente', CORES.recenteFill,
                  CORES.livreFill],
                'fill-opacity': ['match', ['get', 'estado'], 'destaque', 0.5, 'recente', 0.28, 0.22]
              }
        });
        map.addLayer({
          id: 'cartao-linha', type: 'line', source: 'cartao',
          paint: modo === 'arquivo'
            ? { 'line-color': '#475569', 'line-width': 2 }
            : {
                'line-color': ['match', ['get', 'estado'],
                  'destaque', CORES.destaqueLinha,
                  'recente', CORES.recenteLinha,
                  CORES.livreLinha],
                'line-width': ['match', ['get', 'estado'], 'destaque', 4, 1.5]
              }
        });

        // Setas dos territórios LIMÍTROFES (modo arquivo): "↗ TERRITÓRIO 2"
        // na borda do cartão apontando pra direção do vizinho — como o
        // cartão do app antigo — em vez de desenhar os polígonos/letras
        // dele (que poluíam o cartão de arquivo).
        if (modo === 'arquivo') {
          const cont = map.getContainer();
          const W = cont.clientWidth, H = cont.clientHeight;
          // margem 105: a âncora do texto é o CENTRO — "TERRITÓRIO 22 ↘"
          // tem ~170px de largura, metade pra cada lado; com margem menor
          // a ponta do rótulo cortava na borda do cartão.
          const cx = W / 2, cy = H / 2, margem = 105;
          const diag = Math.hypot(W, H);
          const porVizinho = new Map<string, { x: number; y: number }>();
          for (const q of quadras) {
            if (destaque.has(q.id) || !q.territorio_id) continue;
            const c = centroidePoligono(q.poly_geojson);
            if (!c) continue;
            const p = map.project([c.lng, c.lat]);
            const d = Math.hypot(p.x - cx, p.y - cy);
            const atual = porVizinho.get(q.territorio_id);
            // ponto mais próximo do centro representa o vizinho
            if (!atual || d < Math.hypot(atual.x - cx, atual.y - cy)) porVizinho.set(q.territorio_id, p);
          }
          const setasFeats: any[] = [];
          for (const [tid, p] of porVizinho) {
            const dx = p.x - cx, dy = p.y - cy;
            const dist = Math.hypot(dx, dy);
            if (dist === 0) continue;
            // Longe demais não é limítrofe — sem seta (o critério é a
            // quadra mais próxima do vizinho caber num raio de ~1 tela).
            if (dist > diag * 0.75) continue;
            // Interseção do raio centro→vizinho com o retângulo interno
            // (margem pra seta não colar na borda). Vizinho DENTRO da
            // vista fica no próprio ponto.
            const tX = dx !== 0 ? ((dx > 0 ? W - margem : margem) - cx) / dx : Infinity;
            const tY = dy !== 0 ? ((dy > 0 ? H - margem : margem) - cy) / dy : Infinity;
            const t = Math.min(1, Math.min(tX, tY));
            const ll = map.unproject([cx + dx * t, cy + dy * t] as any);
            // Seta em 8 direções (tela: y cresce pra baixo → ângulo
            // positivo = pra baixo)
            const idx = Math.round((((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) / 45) % 8;
            const seta = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][idx];
            const nome = nomesTerritorios[tid]?.trim() || tid;
            const rotulo = dx >= 0 ? `TERRITÓRIO ${nome} ${seta}` : `${seta} TERRITÓRIO ${nome}`;
            setasFeats.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
              properties: { rotulo }
            });
          }
          if (setasFeats.length > 0) {
            map.addSource('vizinhos', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: setasFeats }
            });
            map.addLayer({
              id: 'vizinhos-seta', type: 'symbol', source: 'vizinhos',
              layout: {
                'text-field': ['get', 'rotulo'],
                'text-size': 18,
                'text-font': ['Noto Sans Bold'],
                'text-allow-overlap': true,
                'text-ignore-placement': true
              },
              paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 }
            });
          }
        }

        // DESENHO das ruas por cima do preenchimento das quadras
        // ("dá pra desenhar as ruas?" — dá): o fill colorido cobria as
        // ruas finas do basemap e o mapa virava um bloco de cor sem os
        // corredores. Corredor branco com contorno cinza, como no cartão
        // do app antigo — todas as vias de carro (com e sem nome), traçado
        // real vindo da Overpass. Abaixo dos rótulos, acima do fill.
        if (vias.length > 0) {
          map.addSource('vias-linhas', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: vias.map((v) => ({
                type: 'Feature' as const,
                geometry: { type: 'LineString' as const, coordinates: v.pontos },
                properties: {}
              }))
            }
          });
          map.addLayer({
            id: 'vias-casing', type: 'line', source: 'vias-linhas',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#94a3b8', 'line-width': 8 }
          });
          map.addLayer({
            id: 'vias-corpo', type: 'line', source: 'vias-linhas',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 6 }
          });
          map.addSource('vias', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: rotulosVias }
          });
          map.addLayer({
            id: 'vias-nome', type: 'symbol', source: 'vias',
            layout: {
              'text-field': ['get', 'nome'],
              // "deixa mais visível o nome da rua": Medium 17 com halo
              // reforçado — mais presente que o Regular 16 anterior, mas
              // ainda abaixo da letra vermelha da quadra na hierarquia.
              'text-size': 17,
              'text-font': ['Noto Sans Medium'],
              'text-rotate': ['get', 'angulo'],
              'text-rotation-alignment': 'map',
              // Colisão controla a repetição do mesmo nome ao longo da
              // rua (agora é um rótulo por TRECHO); trecho mais longo tem
              // prioridade de aparecer.
              'symbol-sort-key': ['get', 'ordem'],
              'text-allow-overlap': false,
              'text-padding': 2,
              // Rua curta com nome comprido: no lugar da via o rótulo
              // colide com os das ruas vizinhas e era DESCARTADO (rua
              // sem nome entre B e C — queixa real). Com âncoras
              // alternativas o MapLibre tenta deslocar o nome pro lado
              // livre antes de desistir — o nome fica AO LADO da viela,
              // no espírito da "setinha" do cartão antigo.
              'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
              'text-radial-offset': 0.6,
              // Quebra mais cedo (8em em vez do padrão 10em): caixa de
              // colisão menor = menos rótulo descartado.
              'text-max-width': 8
            },
            paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
          });
        }
        // Rótulos (letra + ✕) ancorados em PONTOS de centroide calculados
        // por nós — não no polígono. Rotular polígono deixa o MapLibre
        // escolher a âncora POR TILE: quadra cortada pela borda de um
        // tile ganhava a letra deslocada do centro (âncora do pedaço, não
        // da quadra) ou até DUPLICADA (uma por tile, e o allow-overlap
        // não deduplica). Com ponto próprio a letra fica cravada no meio,
        // como no cartão de referência do app antigo.
        const centros = features
          .map((f) => {
            const c = centroidePoligono(f.geometry);
            return c
              ? {
                  type: 'Feature' as const,
                  geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
                  properties: f.properties
                }
              : null;
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);
        map.addSource('cartao-centros', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: centros }
        });
        map.addLayer({
          id: 'cartao-rotulo', type: 'symbol', source: 'cartao-centros',
          layout: {
            // SÓ a letra (rotulo, sem o número do território — ver
            // rotuloQuadra) e GRANDE, como no cartão do app antigo que o
            // usuário usa de referência: letra da quadra é o elemento mais
            // proeminente do cartão.
            'text-field': ['get', 'rotulo'],
            'text-size': 30,
            'text-font': ['Noto Sans Bold'],
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          // Vermelho como no cartão de referência — destaca a letra sobre
          // qualquer preenchimento; halo branco grosso garante contraste
          // até por cima da quadra vermelha (recente).
          paint: { 'text-color': '#b91c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 2.6 }
        });
        // O ✕ das concluídas recentes: mesmo ponto de centroide, deslocado
        // pra baixo da letra.
        map.addLayer({
          id: 'cartao-x', type: 'symbol', source: 'cartao-centros',
          filter: ['==', ['get', 'estado'], 'recente'],
          layout: {
            'text-field': '✕',
            'text-size': 38,
            'text-font': ['Noto Sans Bold'],
            'text-offset': [0, 0.9],
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: { 'text-color': '#b91c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 }
        });
        // "Setinha" do cartão antigo: rua curta cujo nome foi 100%
        // DESCARTADO pela colisão (os nomes das ruas vizinhas ocupam o
        // espaço — queixa real da viela entre B e C) ganha uma segunda
        // chance com o rótulo DESLOCADO pro lado mais livre + uma
        // linha-guia fininha apontando pra rua. Só dá pra saber o que a
        // colisão descartou DEPOIS do primeiro idle (o placement roda no
        // render), por isso a captura vira duas fases: assenta → resgata
        // → assenta de novo → captura.
        function resgatarRotulosPerdidos(): boolean {
          if (rotulosVias.length === 0 || !map.getLayer('vias-nome')) return false;
          const renderizados = new Set(
            map
              .queryRenderedFeatures(undefined as any, { layers: ['vias-nome'] })
              .map((f: any) => f.properties?.nome)
          );
          // Perdido = NOME sem nenhuma instância renderizada (rótulo de
          // trecho repetido da mesma rua é descarte proposital da
          // colisão, não conta). Resgata só o melhor trecho (mais longo)
          // de cada nome, dentro da vista.
          const bounds = map.getBounds();
          const porNome = new Map<string, (typeof rotulosVias)[number]>();
          for (const f of rotulosVias) {
            const nome = f.properties.nome;
            if (renderizados.has(nome)) continue;
            const [lng, lat] = f.geometry.coordinates;
            if (!bounds.contains([lng, lat] as any)) continue;
            const atual = porNome.get(nome);
            if (!atual || f.properties.ordem < atual.properties.ordem) porNome.set(nome, f);
          }
          // Muitos perdidos = zoom pequeno demais pra caber tudo; setinha
          // em dúzia viraria poluição pior que a ausência. Prioriza as
          // ruas mais CURTAS (ordem maior): a motivação do resgate é a
          // viela espremida entre quadras — rua longa sem rótulo em
          // nenhum trecho é caso raro e menos grave.
          const perdidos = [...porNome.values()]
            .sort((a, b) => b.properties.ordem - a.properties.ordem)
            .slice(0, 10);
          if (perdidos.length === 0) return false;

          const ancoras = rotulosVias.map((f) => map.project(f.geometry.coordinates as [number, number]));
          const resgates: any[] = [];
          const guias: any[] = [];
          for (const f of perdidos) {
            const [lng, lat] = f.geometry.coordinates;
            const p = map.project([lng, lat]);
            // Perpendicular à via na TELA (angulo é horário, y cresce pra
            // baixo): desloca pro lado cujo ponto fica mais LONGE de
            // todos os outros rótulos (aproximação barata de "espaço
            // livre" — geralmente o miolo de uma quadra vizinha).
            const a = (f.properties.angulo * Math.PI) / 180;
            const nx = -Math.sin(a);
            const ny = Math.cos(a);
            const OFF = 60;
            const lados = [
              { x: p.x + nx * OFF, y: p.y + ny * OFF },
              { x: p.x - nx * OFF, y: p.y - ny * OFF }
            ];
            const folga = (q: { x: number; y: number }) =>
              Math.min(...ancoras.map((c) => Math.hypot(c.x - q.x, c.y - q.y)));
            const q = folga(lados[0]) >= folga(lados[1]) ? lados[0] : lados[1];
            const ll = map.unproject([q.x, q.y] as any);
            resgates.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
              properties: { nome: f.properties.nome, angulo: f.properties.angulo }
            });
            guias.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [[ll.lng, ll.lat], [lng, lat]] },
              properties: {}
            });
          }
          map.addSource('vias-resgate-guia', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: guias }
          });
          // beforeId 'cartao-rotulo': a letra vermelha da quadra continua
          // por cima de tudo.
          map.addLayer(
            {
              id: 'vias-resgate-guia', type: 'line', source: 'vias-resgate-guia',
              paint: { 'line-color': '#334155', 'line-width': 1.5 }
            },
            'cartao-rotulo'
          );
          map.addSource('vias-resgate', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: resgates }
          });
          map.addLayer(
            {
              id: 'vias-resgate-nome', type: 'symbol', source: 'vias-resgate',
              layout: {
                'text-field': ['get', 'nome'],
                'text-size': 17,
                'text-font': ['Noto Sans Medium'],
                'text-rotate': ['get', 'angulo'],
                'text-rotation-alignment': 'map',
                'text-max-width': 8,
                // Forçado: o motivo de existir é a colisão ter descartado —
                // aqui ele SEMPRE renderiza (halo forte segura a leitura).
                'text-allow-overlap': true,
                'text-ignore-placement': true
              },
              paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 }
            },
            'cartao-rotulo'
          );
          return true;
        }

        const capturar = () => {
          clearTimeout(timeout);
          try {
            acabar(map.getCanvas().toDataURL('image/png'));
          } catch {
            acabar(null);
          }
        };
        map.once('idle', () => {
          let resgatou = false;
          try {
            resgatou = resgatarRotulosPerdidos();
          } catch {
            // resgate é acessório — falhou, captura como está
          }
          if (resgatou) map.once('idle', capturar);
          else capturar();
        });
      });
    });
  }

  function linhaPontilhada(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number) {
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.restore();
  }

  export async function gerar(opts: {
    localidade: string;
    terrNumeros: string;
    basemap: string;
    limiarDias: number;
  }): Promise<string | null> {
    const mapaPng = await renderizarMapa(opts.basemap, opts.limiarDias);
    if (!mapaPng) return null;
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('png do mapa inválido'));
      img.src = mapaPng;
    });

    // Cartão 1600×1035 ≈ proporção do S-12 impresso, em 2x.
    const W = 1600, H = 1035;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const serif = 'Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Título
    ctx.fillStyle = '#000000';
    ctx.font = `bold 46px ${serif}`;
    ctx.textAlign = 'center';
    ctx.fillText('Cartão de Mapa de Território', W / 2, 80);

    // Linha Localidade ....... Terr. N.º ...
    ctx.textAlign = 'left';
    ctx.font = `bold 27px ${serif}`;
    const yLinha = 142;
    ctx.fillText('Localidade', 64, yLinha);
    const wLoc = ctx.measureText('Localidade').width;
    const xTerr = 1200;
    ctx.fillText('Terr. N.º', xTerr, yLinha);
    const wTerr = ctx.measureText('Terr. N.º').width;
    linhaPontilhada(ctx, 64 + wLoc + 12, xTerr - 24, yLinha + 4);
    linhaPontilhada(ctx, xTerr + wTerr + 12, W - 64, yLinha + 4);
    ctx.font = `27px ${serif}`;
    if (opts.localidade) {
      ctx.textAlign = 'center';
      ctx.fillText(opts.localidade, (64 + wLoc + xTerr - 24) / 2, yLinha - 2, xTerr - 64 - wLoc - 60);
      ctx.textAlign = 'left';
    }
    if (opts.terrNumeros) {
      ctx.textAlign = 'center';
      ctx.fillText(opts.terrNumeros, (xTerr + wTerr + 12 + W - 64) / 2, yLinha - 2, W - 64 - xTerr - wTerr - 24);
      ctx.textAlign = 'left';
    }

    // Área do mapa (contain-fit centralizado)
    const area = { x: 64, y: 176, w: W - 128, h: 726 };
    const escala = Math.min(area.w / img.width, area.h / img.height);
    const dw = img.width * escala, dh = img.height * escala;
    const dx = area.x + (area.w - dw) / 2, dy = area.y + (area.h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(dx, dy, dw, dh);

    // Legenda compacta dentro do mapa (canto inferior esquerdo) — fonte e
    // caixas de cor bem maiores (queixa real: legenda ilegível no cartão
    // impresso). `textBaseline = 'middle'` centraliza o texto na caixinha
    // de cor sem precisar calcular offset de baseline na mão.
    // SÓ no modo link: designadas/feitas há pouco é estado do DIA — no
    // cartão de arquivo (lote) não existe e a legenda só ocupava espaço.
    if (modo === 'link') {
    const leg = [
      { cor: CORES.destaqueFill, rotulo: 'Designadas' },
      { cor: CORES.recenteFill, rotulo: 'Feitas há pouco (✕)' },
      { cor: CORES.livreFill, rotulo: 'Disponíveis' }
    ];
    const legFonte = 26, legSwatch = 26, legPadX = 14, legGap = 34;
    ctx.font = `600 ${legFonte}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    let larguraTotal = legPadX;
    for (const l of leg) larguraTotal += legSwatch + 10 + ctx.measureText(l.rotulo).width + legGap;
    larguraTotal += legPadX - legGap;
    const legX = dx + 14;
    const legY = dy + dh - 40;
    const legH = legSwatch + 22;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(legX - legPadX, legY - legH / 2, larguraTotal, legH);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(legX - legPadX, legY - legH / 2, larguraTotal, legH);
    let cursor = legX;
    for (const l of leg) {
      ctx.fillStyle = l.cor;
      ctx.fillRect(cursor, legY - legSwatch / 2, legSwatch, legSwatch);
      ctx.strokeStyle = 'rgba(15,23,42,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cursor, legY - legSwatch / 2, legSwatch, legSwatch);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(l.rotulo, cursor + legSwatch + 10, legY);
      cursor += legSwatch + 10 + ctx.measureText(l.rotulo).width + legGap;
    }
    ctx.textBaseline = 'alphabetic'; // reset — resto do desenho (rodapé) espera baseline padrão
    }

    // Rodapé (texto clássico do S-12)
    ctx.fillStyle = '#000000';
    ctx.font = `bold 23px ${serif}`;
    ctx.fillText('Guarde este cartão no envelope. Tome cuidado para não o manchar, marcar ou dobrar. Cada vez', 64, 946);
    ctx.fillText('que o território for coberto, queira informar disso o irmão que cuida do arquivo de territórios.', 64, 978);
    ctx.font = '18px ' + serif;
    ctx.fillText('S-12-T', 64, 1012);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, W - 64, 1012);
    ctx.textAlign = 'left';

    return canvas.toDataURL('image/png');
  }
</script>

<!-- Container do mapa oculto: precisa existir no DOM com tamanho real pro
     MapLibre renderizar; fica fora da viewport. 1480×740 ≈ proporção da
     área branca do cartão. -->
<div
  bind:this={containerMapa}
  style="position: fixed; left: -12000px; top: 0; width: 1480px; height: 740px;"
  aria-hidden="true"
></div>
