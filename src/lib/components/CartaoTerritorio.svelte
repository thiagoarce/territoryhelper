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
        // Arquivo: gutter maior em volta do território — é NELE que os
        // rótulos de vizinho limítrofe vivem ("sempre fora das quadras").
        // Com 34px o rótulo não teria onde ficar sem invadir o polígono.
        fitBoundsOptions: { padding: modo === 'arquivo' ? 70 : 34 },
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
        // Modo arquivo: rua SÓ se encosta no território — a até ~45m do
        // bbox de ALGUMA quadra destacada, não do bbox GLOBAL (+20%, a
        // versão anterior): num território comprido/irregular o bbox
        // global cobre meio cartão e voltava rua "que nem no território
        // tá" (queixa real do lote). Vale pro NOME e pro TRAÇADO — fora
        // do território o basemap já desenha a rua; o corredor por cima
        // dele era a "rua uma encima da outra".
        const MARGEM_VIA = 0.0004; // ~45m em graus
        const bboxesQuadras =
          modo === 'arquivo'
            ? featuresDestaque
                .map((f) => bboxDeTudo([f]))
                .filter((b): b is NonNullable<typeof b> => b !== null)
            : [];
        const pertoDeQuadra = (lng: number, lat: number) =>
          bboxesQuadras.some(
            ([[a, b], [c, d]]) =>
              lng >= a - MARGEM_VIA && lng <= c + MARGEM_VIA &&
              lat >= b - MARGEM_VIA && lat <= d + MARGEM_VIA
          );
        const viasDesenho =
          modo === 'arquivo'
            ? vias.filter((v) => v.pontos.some(([ln, la]) => pertoDeQuadra(ln, la)))
            : vias;
        // ===== Rótulos de rua: colocação FEITA POR NÓS, não pelo MapLibre =====
        // A colisão nativa usa caixa SEM rotação pra texto rotacionado:
        // em malha diagonal/vertical deixava nomes DIFERENTES um em cima
        // do outro (cartões 1 e 9 do lote) e descartava nome com espaço
        // de sobra — que aí ganhava setinha sem precisar (cartão 15).
        // Aqui cada rótulo vira um retângulo ROTACIONADO estimado do
        // texto; colocação gulosa (trecho mais longo primeiro) com teste
        // de interseção exato (SAT); o layer desenha com allow-overlap —
        // a decisão de colisão já foi tomada aqui.
        const cantosRet = (cx: number, cy: number, w: number, h: number, angGraus: number) => {
          const a = (angGraus * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
          const hw = w / 2, hh = h / 2;
          return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({
            x: cx + x * ca - y * sa,
            y: cy + x * sa + y * ca
          }));
        };
        type Caixa = ReturnType<typeof cantosRet>;
        const caixasColidem = (A: Caixa, B: Caixa) => {
          for (const poly of [A, B]) {
            for (let i = 0; i < poly.length; i++) {
              const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
              const nx = p2.y - p1.y, ny = p1.x - p2.x;
              let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
              for (const p of A) { const d = p.x * nx + p.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
              for (const p of B) { const d = p.x * nx + p.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
              if (maxA < minB || maxB < minA) return false; // eixo separador
            }
          }
          return true;
        };
        // Caixa estimada do texto: ~8.6px/char no Medium 17, quebra de
        // linha no max-width 8em (~140px), ~20px por linha, + folga de
        // respiro. Estimativa GENEROSA de propósito: passar caixa justa
        // devolve o empilhamento.
        // Rótulo NA via fica em UMA linha (nome quebrado no meio da rua
        // longa era queixa); o da setinha usa a caixa QUEBRADA (compacta,
        // cabe no miolo de uma quadra).
        const caixaUmaLinha = (nome: string) => ({ w: nome.length * 8.6 + 12, h: 28 });
        const caixaQuebrada = (nome: string) => {
          const larguraTotal = nome.length * 8.6;
          const linhas = Math.max(1, Math.ceil(larguraTotal / 140));
          return { w: Math.min(larguraTotal, 140) + 12, h: linhas * 20 + 8 };
        };
        // O mundo de colisão já NASCE com a letra vermelha de cada quadra
        // (e o ✕ das recentes) — nome de rua não cobre a letra.
        const caixasOcupadas: Caixa[] = [];
        for (const f of features) {
          const c = centroidePoligono(f.geometry);
          if (!c) continue;
          const pc = map.project([c.lng, c.lat] as [number, number]);
          caixasOcupadas.push(cantosRet(pc.x, pc.y, 40, 40, 0));
          if (f.properties.estado === 'recente') caixasOcupadas.push(cantosRet(pc.x, pc.y + 34, 38, 38, 0));
        }
        // Segmentos AGRUPADOS POR NOME: a garantia é por NOME de rua
        // ("tem que dar um jeito de colocar o nome de todas as ruas
        // internas do território"), não por trecho.
        const segsPorNome = new Map<string, { pontos: [number, number][]; metros: number }[]>();
        // Rua INTERNA (dentro do bbox do território) tem prioridade e
        // garantia de nome; a da franja de 45m em volta é contexto,
        // entra se sobrar espaço.
        const MARGEM_INTERNA = 0.00015; // ~17m
        const internoPorNome = new Map<string, boolean>();
        for (const v of viasDesenho) {
          if (!v.nome || comprimentoMetros(v.pontos) < 25) continue;
          const meio = pontoDoRotulo(v.pontos);
          if (!meio) continue;
          if (modo === 'arquivo' && !pertoDeQuadra(meio.lng, meio.lat)) continue;
          const nome = abreviarLogradouro(v.nome);
          const lista = segsPorNome.get(nome) ?? [];
          lista.push({ pontos: v.pontos as [number, number][], metros: comprimentoMetros(v.pontos) });
          segsPorNome.set(nome, lista);
          const interno =
            meio.lng >= minLng - MARGEM_INTERNA && meio.lng <= maxLng + MARGEM_INTERNA &&
            meio.lat >= minLat - MARGEM_INTERNA && meio.lat <= maxLat + MARGEM_INTERNA;
          if (interno || !internoPorNome.has(nome)) internoPorNome.set(nome, interno || !!internoPorNome.get(nome));
        }
        for (const lista of segsPorNome.values()) lista.sort((a, b) => b.metros - a.metros);
        const nomesOrdenados = [...segsPorNome.keys()].sort((a, b) => {
          const ia = internoPorNome.get(a) ? 1 : 0, ib = internoPorNome.get(b) ? 1 : 0;
          if (ia !== ib) return ib - ia; // internas primeiro
          return segsPorNome.get(b)![0].metros - segsPorNome.get(a)![0].metros;
        });
        const contEl = map.getContainer();
        const WEl = contEl.clientWidth, HEl = contEl.clientHeight;
        const rotulosColocados: any[] = [];
        const guiasResgate: any[] = [];
        const posPorNome = new Map<string, { x: number; y: number }[]>();
        const registrar = (
          nome: string, lng: number, lat: number, angulo: number,
          caixa: Caixa, px: { x: number; y: number }, quebra: boolean
        ) => {
          caixasOcupadas.push(caixa);
          const lista = posPorNome.get(nome) ?? [];
          lista.push(px);
          posPorNome.set(nome, lista);
          rotulosColocados.push({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [lng, lat] },
            properties: { nome, angulo, quebra: quebra ? 'sim' : 'nao' }
          });
        };
        // Tenta o rótulo NA PRÓPRIA via, provando vários pontos ao longo
        // do trecho — não só o meio: o meio ocupado não condena a rua.
        // Primeiro em UMA linha ("em ruas longas não preciso do nome
        // quebrado"); nome comprido que não coube esticado ainda tenta
        // QUEBRADO no próprio lugar — melhor que ir direto pra setinha.
        const tentarNaVia = (nome: string, seg: { pontos: [number, number][] }): boolean => {
          const umaLinha = caixaUmaLinha(nome);
          const quebrada = caixaQuebrada(nome);
          const formas: [typeof umaLinha, boolean][] =
            quebrada.w < umaLinha.w - 40 ? [[umaLinha, false], [quebrada, true]] : [[umaLinha, false]];
          for (const [{ w, h }, quebra] of formas) {
            for (const frac of [0.5, 0.35, 0.65, 0.22, 0.78]) {
              const p = pontoDoRotulo(seg.pontos, frac);
              if (!p) continue;
              const px = map.project([p.lng, p.lat] as [number, number]);
              const lista = posPorNome.get(nome) ?? [];
              // já tem esse nome a menos de 220px — este trecho não precisa
              if (lista.some((q) => Math.hypot(q.x - px.x, q.y - px.y) < 220)) return false;
              const caixa = cantosRet(px.x, px.y, w, h, p.angulo);
              if (caixasOcupadas.some((c) => caixasColidem(c, caixa))) continue;
              registrar(nome, p.lng, p.lat, p.angulo, caixa, px, quebra);
              return true;
            }
          }
          return false;
        };
        // PASSO 1: um rótulo por nome, na própria rua (internas primeiro,
        // depois por comprimento — nome grande precisa de espaço contínuo).
        for (const nome of nomesOrdenados) {
          for (const seg of segsPorNome.get(nome)!) if (tentarNaVia(nome, seg)) break;
        }
        // PASSO 2: "setinha" pro nome INTERNO que não coube em NENHUM
        // trecho — rótulo QUEBRADO (caixa compacta) deslocado, guia
        // apontando pro trecho. Roda ANTES da repetição de rua longa: a
        // repetição é luxo, o primeiro nome de cada rua interna é
        // requisito ("preciso ter o nome de todas as ruas internas").
        // 6 direções × distâncias progressivas até bem longe ("dá pra
        // usar setas maiores para chegar num lugar mais livre") — ficar
        // de fora é só o caso extremo de não haver espaço NENHUM.
        for (const nome of nomesOrdenados) {
          if (posPorNome.has(nome) || !internoPorNome.get(nome)) continue;
          const { w, h } = caixaQuebrada(nome);
          busca: for (const seg of segsPorNome.get(nome)!) {
            for (const frac of [0.5, 0.3, 0.7]) {
              const p = pontoDoRotulo(seg.pontos, frac);
              if (!p) continue;
              const px = map.project([p.lng, p.lat] as [number, number]);
              for (const dist of [45, 70, 100, 135, 175, 220, 270, 330]) {
                for (const g of [90, -90, 45, -45, 135, -135]) {
                  const t = ((p.angulo + g) * Math.PI) / 180;
                  const q = { x: px.x + Math.cos(t) * dist, y: px.y + Math.sin(t) * dist };
                  if (q.x < w / 2 || q.y < h / 2 || q.x > WEl - w / 2 || q.y > HEl - h / 2) continue;
                  const caixa = cantosRet(q.x, q.y, w, h, p.angulo);
                  if (caixasOcupadas.some((c) => caixasColidem(c, caixa))) continue;
                  const ll = map.unproject([q.x, q.y] as any);
                  registrar(nome, ll.lng, ll.lat, p.angulo, caixa, q, true);
                  guiasResgate.push({
                    type: 'Feature' as const,
                    geometry: { type: 'LineString' as const, coordinates: [[ll.lng, ll.lat], [p.lng, p.lat]] },
                    properties: {}
                  });
                  break busca;
                }
              }
            }
          }
        }
        // PASSO 3: repetição em rua longa — só DEPOIS de toda rua interna
        // ter garantido o primeiro rótulo (repetir cedo roubava o espaço
        // das setinhas e dos nomes seguintes).
        for (const nome of nomesOrdenados) {
          if (!posPorNome.has(nome)) continue;
          for (const seg of segsPorNome.get(nome)!) tentarNaVia(nome, seg);
        }
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
            // 0.22: com 0.16 o corredor branco das ruas quase não
            // contrastava com o fill e "as ruas desenhadas" sumiam
            ? { 'fill-color': '#94a3b8', 'fill-opacity': 0.22 }
            : {
                'fill-color': ['match', ['get', 'estado'],
                  'destaque', CORES.destaqueFill,
                  'recente', CORES.recenteFill,
                  CORES.livreFill],
                'fill-opacity': ['match', ['get', 'estado'], 'destaque', 0.5, 'recente', 0.28, 0.22]
              }
        });
        // Contorno EMBAIXO das ruas nos dois modos — mesma geometria do
        // exportável do link ("o objetivo era só ficar como tá o
        // exportável do mapa do dirigente"): onde a rua passa, o corredor
        // branco cobre o traço e a rua fica branca; o que sobra do traço
        // dá a definição do bloco. As duas tentativas de contorno POR
        // CIMA das ruas (casing branco; depois traço recuado pra dentro
        // via miter-inset) viraram linha escura em toda rua interna e
        // "linhas cruzando" em quadra irregular — queixas reais do lote.
        map.addLayer({
          id: 'cartao-linha', type: 'line', source: 'cartao',
          paint: modo === 'arquivo'
            // neutro + peso de "destaque" do link (4px): é o que resta
            // de ênfase do território além do fill e das letras
            ? { 'line-color': '#334155', 'line-width': 4 }
            : {
                'line-color': ['match', ['get', 'estado'],
                  'destaque', CORES.destaqueLinha,
                  'recente', CORES.recenteLinha,
                  CORES.livreLinha],
                'line-width': ['match', ['get', 'estado'], 'destaque', 4, 1.5]
              }
        });

        // DESENHO das ruas por cima do preenchimento das quadras
        // ("dá pra desenhar as ruas?" — dá): o fill colorido cobria as
        // ruas finas do basemap e o mapa virava um bloco de cor sem os
        // corredores. Corredor branco com contorno cinza, como no cartão
        // do app antigo — todas as vias de carro (com e sem nome), traçado
        // real vindo da Overpass. Abaixo dos rótulos, acima do fill.
        if (viasDesenho.length > 0) {
          map.addSource('vias-linhas', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: viasDesenho.map((v) => ({
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
          if (guiasResgate.length > 0) {
            map.addSource('vias-resgate-guia', {
              type: 'geojson',
              data: { type: 'FeatureCollection', features: guiasResgate }
            });
            // Casing branco por baixo: a guia agora pode ser comprida
            // (até ~220px) e cruzar corredor/fill sem sumir.
            map.addLayer({
              id: 'vias-resgate-guia-casing', type: 'line', source: 'vias-resgate-guia',
              paint: { 'line-color': '#ffffff', 'line-width': 3.5 }
            });
            map.addLayer({
              id: 'vias-resgate-guia', type: 'line', source: 'vias-resgate-guia',
              paint: { 'line-color': '#334155', 'line-width': 1.6 }
            });
          }
          map.addSource('vias', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: rotulosColocados }
          });
          // Dois layers, mesmo estilo: rótulo NA via em UMA linha
          // (quebra='nao', max-width altíssimo) e rótulo de setinha
          // QUEBRADO (quebra='sim', 8em ≈ 140px — mesma largura usada na
          // estimativa caixaQuebrada; mudar um exige mudar o outro).
          // A colisão já foi decidida na colocação acima — aqui só
          // desenha o que foi aprovado (allow-overlap).
          for (const [sufixo, quebra, maxW] of [['', 'nao', 60], ['-quebra', 'sim', 8]] as const) {
            map.addLayer({
              id: `vias-nome${sufixo}`, type: 'symbol', source: 'vias',
              filter: ['==', ['get', 'quebra'], quebra],
              layout: {
                'text-field': ['get', 'nome'],
                // "deixa mais visível o nome da rua": Medium 17 com halo
                // reforçado — abaixo da letra vermelha na hierarquia.
                'text-size': 17,
                'text-font': ['Noto Sans Medium'],
                'text-rotate': ['get', 'angulo'],
                'text-rotation-alignment': 'map',
                'text-max-width': maxW,
                'text-allow-overlap': true,
                'text-ignore-placement': true
              },
              paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
            });
          }
        }

        // Setas dos territórios LIMÍTROFES (modo arquivo): "2 →" na
        // borda do cartão apontando pra direção do vizinho — como o
        // cartão do app antigo — em vez de desenhar os polígonos/letras
        // dele (que poluíam o cartão de arquivo). Depois das ruas: a seta
        // fica POR CIMA de corredor/nome de rua ("deixar bem em destaque",
        // queixa real: 18px slate se perdia no meio dos nomes).
        if (modo === 'arquivo') {
          const cont = map.getContainer();
          const W = cont.clientWidth, H = cont.clientHeight;
          const cx = W / 2, cy = H / 2;
          // O rótulo vive no GUTTER (padding 70px do fitBounds, acima):
          // centro a 36px da borda do cartão → sempre FORA do bbox do
          // território, que começa a >= 70px de qualquer borda.
          const margem = 36;
          // Bbox do território em PIXELS, pro teste exato de "coube fora"
          const bboxTL = map.project([minLng, maxLat] as any);
          const bboxBR = map.project([maxLng, minLat] as any);
          // LIMÍTROFE de verdade, em METROS: quadra do vizinho a até 200m
          // da borda (bbox) do território. O critério anterior ("dentro
          // de ~1 tela do centro") pegava território a 2-3 quarteirões e
          // virava sopa de letrinhas (queixa real: cartão do T2 com 12
          // rótulos, vários em cima do próprio território).
          const cosLatT = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
          const distAoBboxM = (lng: number, lat: number) => {
            const dLng = Math.max(minLng - lng, 0, lng - maxLng) * cosLatT;
            const dLat = Math.max(minLat - lat, 0, lat - maxLat);
            return Math.hypot(dLng, dLat) * 111320;
          };
          const porVizinho = new Map<string, { c: { lng: number; lat: number }; distM: number }>();
          for (const q of quadras) {
            if (destaque.has(q.id) || !q.territorio_id) continue;
            const c = centroidePoligono(q.poly_geojson);
            if (!c) continue;
            const distM = distAoBboxM(c.lng, c.lat);
            const atual = porVizinho.get(q.territorio_id);
            if (!atual || distM < atual.distM) porVizinho.set(q.territorio_id, { c, distM });
          }
          const setasFeats: any[] = [];
          const colocadas: { x: number; y: number; w: number }[] = [];
          for (const [tid, v] of porVizinho) {
            if (v.distM > 200) continue; // não é limítrofe
            const p = map.project([v.c.lng, v.c.lat]);
            const dx = p.x - cx, dy = p.y - cy;
            if (dx === 0 && dy === 0) continue;
            // Seta em 8 direções (tela: y cresce pra baixo → ângulo
            // positivo = pra baixo)
            const idx = Math.round((((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) / 45) % 8;
            const seta = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][idx];
            // Compacto, sem a palavra "TERRITÓRIO" (pedido): "24 →" já
            // diz tudo com o halo-pílula branco por trás.
            const nome = (nomesTerritorios[tid]?.trim() || tid).replace(/^territ[óo]rio\s*/i, '');
            const rotulo = dx >= 0 ? `${nome} ${seta}` : `${seta} ${nome}`;
            // Posição na borda do cartão, na direção do vizinho (raio
            // centro→vizinho ∩ retângulo interno a `margem` px).
            const tX = dx !== 0 ? ((dx > 0 ? W - margem : margem) - cx) / dx : Infinity;
            const tY = dy !== 0 ? ((dy > 0 ? H - margem : margem) - cy) / dy : Infinity;
            const t = Math.min(tX, tY);
            // Caixa estimada do texto (24px bold ≈ 13px/char) — clampa
            // pra dentro do cartão e depois testa se sobrou FORA do
            // território; "se não couber não precisa colocar".
            const wTxt = rotulo.length * 13 + 10, hTxt = 32;
            const px = Math.min(Math.max(cx + dx * t, wTxt / 2 + 4), W - wTxt / 2 - 4);
            const py = Math.min(Math.max(cy + dy * t, hTxt / 2 + 2), H - hTxt / 2 - 2);
            const invadeTerritorio =
              px + wTxt / 2 > bboxTL.x && px - wTxt / 2 < bboxBR.x &&
              py + hTxt / 2 > bboxTL.y && py - hTxt / 2 < bboxBR.y;
            if (invadeTerritorio) continue;
            if (colocadas.some((c2) => Math.abs(c2.x - px) < (c2.w + wTxt) / 2 + 12 && Math.abs(c2.y - py) < 36)) continue;
            colocadas.push({ x: px, y: py, w: wTxt });
            const ll = map.unproject([px, py] as any);
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
                'text-size': 24,
                'text-font': ['Noto Sans Bold'],
                'text-allow-overlap': true,
                'text-ignore-placement': true
              },
              // Halo bem grosso vira a "pílula" branca em volta do número
              paint: { 'text-color': '#1d4ed8', 'text-halo-color': '#ffffff', 'text-halo-width': 4 }
            });
          }
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
        // (o resgate com linha-guia agora acontece junto da colocação de
        // rótulos, lá em cima — uma fase só, sem queryRenderedFeatures.)
        const capturar = () => {
          clearTimeout(timeout);
          try {
            acabar(map.getCanvas().toDataURL('image/png'));
          } catch {
            acabar(null);
          }
        };
        map.once('idle', capturar);
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
