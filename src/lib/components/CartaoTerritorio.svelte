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
  import { buscarViasComNome, pontoDoRotulo, abreviarLogradouro, type ViaComNome } from '$lib/utils/overpass';

  export interface QuadraContexto {
    id: string;
    territorio_id: string | null;
    data_conclusao: string | null;
    poly_geojson: unknown;
  }

  let {
    quadras,
    destaqueIds
  }: {
    quadras: QuadraContexto[];
    destaqueIds: string[];
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
      if (resto) return resto;
    }
    return id;
  }

  async function renderizarMapa(basemap: string, limiarDias: number): Promise<string | null> {
    const destaque = new Set(destaqueIds);
    const features = quadras
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
        // Cada via vira UM ponto rotacionado (não uma linha) — ver
        // pontoDoRotulo em overpass.ts: `symbol-placement: line-center`
        // do MapLibre só desenha o texto se ele COUBER no comprimento da
        // via na tela, e no zoom de um território o nome (~300px) é bem
        // maior que o trecho (~80px), então quase nada aparecia (as duas
        // tentativas anteriores). Símbolo de PONTO com `text-rotate` não
        // tem essa checagem: sempre renderiza, no ângulo real da rua.
        const feats = vias
          .map((v) => {
            const p = pontoDoRotulo(v.pontos);
            return p
              ? {
                  type: 'Feature' as const,
                  geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
                  properties: { nome: abreviarLogradouro(v.nome), angulo: p.angulo }
                }
              : null;
          })
          .filter((f): f is NonNullable<typeof f> => f !== null);
        if (feats.length > 0) {
          // Some com o rótulo do style pra não duplicar nome de rua.
          for (const layerId of nomesStyle) {
            try { map.setLayoutProperty(layerId, 'visibility', 'none'); } catch {}
          }
          map.addSource('vias', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: feats }
          });
          map.addLayer({
            id: 'vias-nome', type: 'symbol', source: 'vias',
            layout: {
              'text-field': ['get', 'nome'],
              // Peso REGULAR (não bold) + tamanho e halo menores pra
              // aproximar do cartão de referência do usuário: nome de rua
              // lá é preto, fino, discreto ao longo da via — não "grita".
              // A letra da quadra (vermelha, 30px, bold) é que domina.
              'text-size': 16,
              'text-font': ['Noto Sans Regular'],
              'text-rotate': ['get', 'angulo'],
              'text-rotation-alignment': 'map',
              // Deixa o MapLibre esconder rótulos que colidem entre si —
              // duas ruas cruzando com nomes um por cima do outro fica
              // ilegível; melhor sumir com um do que empilhar.
              'text-allow-overlap': false,
              'text-padding': 2
            },
            paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }
          });
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
        map.addLayer({
          id: 'cartao-fill', type: 'fill', source: 'cartao',
          paint: {
            'fill-color': ['match', ['get', 'estado'],
              'destaque', CORES.destaqueFill,
              'recente', CORES.recenteFill,
              CORES.livreFill],
            'fill-opacity': ['match', ['get', 'estado'], 'destaque', 0.5, 'recente', 0.28, 0.22]
          }
        });
        map.addLayer({
          id: 'cartao-linha', type: 'line', source: 'cartao',
          paint: {
            'line-color': ['match', ['get', 'estado'],
              'destaque', CORES.destaqueLinha,
              'recente', CORES.recenteLinha,
              CORES.livreLinha],
            'line-width': ['match', ['get', 'estado'], 'destaque', 4, 1.5]
          }
        });
        map.addLayer({
          id: 'cartao-rotulo', type: 'symbol', source: 'cartao',
          layout: {
            // SÓ a letra (rotulo, sem o número do território — ver
            // rotuloQuadra) e GRANDE, como no cartão do app antigo que o
            // usuário usa de referência: letra da quadra é o elemento mais
            // proeminente do cartão.
            'text-field': ['get', 'rotulo'],
            'text-size': 30,
            'text-font': ['Noto Sans Bold'],
            'text-allow-overlap': true
          },
          // Vermelho como no cartão de referência — destaca a letra sobre
          // qualquer preenchimento; halo branco grosso garante contraste
          // até por cima da quadra vermelha (recente).
          paint: { 'text-color': '#b91c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 2.6 }
        });
        // O ✕ das concluídas recentes mora no PRÓPRIO mapa (camada symbol
        // deslocada pra baixo do rótulo) — escala e posiciona de graça.
        map.addLayer({
          id: 'cartao-x', type: 'symbol', source: 'cartao',
          filter: ['==', ['get', 'estado'], 'recente'],
          layout: {
            'text-field': '✕',
            'text-size': 38,
            'text-font': ['Noto Sans Bold'],
            'text-offset': [0, 0.9],
            'text-allow-overlap': true
          },
          paint: { 'text-color': '#b91c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 }
        });
        map.once('idle', () => {
          clearTimeout(timeout);
          try {
            acabar(map.getCanvas().toDataURL('image/png'));
          } catch {
            acabar(null);
          }
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
