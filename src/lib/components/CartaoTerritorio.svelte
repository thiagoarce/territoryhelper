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

  async function renderizarMapa(basemap: string, limiarDias: number): Promise<string | null> {
    const destaque = new Set(destaqueIds);
    const features = quadras
      .filter((q) => q.poly_geojson)
      .map((q) => ({
        type: 'Feature' as const,
        geometry: q.poly_geojson as any,
        properties: {
          id: q.id,
          estado: destaque.has(q.id)
            ? 'destaque'
            : q.data_conclusao && diasDesde(q.data_conclusao) <= limiarDias
              ? 'recente'
              : 'livre'
        }
      }));
    if (features.length === 0) return null;
    const bbox = bboxDeTudo(features);
    if (!bbox) return null;

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
      map.on('load', () => {
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
            'text-field': ['get', 'id'],
            'text-size': 13,
            'text-font': ['Noto Sans Bold'],
            'text-allow-overlap': true
          },
          paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 }
        });
        // O ✕ das concluídas recentes mora no PRÓPRIO mapa (camada symbol
        // deslocada pra baixo do rótulo) — escala e posiciona de graça.
        map.addLayer({
          id: 'cartao-x', type: 'symbol', source: 'cartao',
          filter: ['==', ['get', 'estado'], 'recente'],
          layout: {
            'text-field': '✕',
            'text-size': 30,
            'text-font': ['Noto Sans Bold'],
            'text-offset': [0, 0.9],
            'text-allow-overlap': true
          },
          paint: { 'text-color': '#b91c1c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
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

    // Legenda compacta dentro do mapa (canto inferior esquerdo)
    const leg = [
      { cor: CORES.destaqueFill, rotulo: 'Designadas' },
      { cor: CORES.recenteFill, rotulo: 'Feitas há pouco (✕)' },
      { cor: CORES.livreFill, rotulo: 'Disponíveis' }
    ];
    const legX = dx + 10, legY = dy + dh - 34;
    ctx.font = '18px system-ui, sans-serif';
    let cursor = legX;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const legW = leg.reduce((acc, l) => acc + 26 + ctx.measureText(l.rotulo).width + 18, 12);
    ctx.fillRect(legX - 6, legY - 20, legW, 30);
    for (const l of leg) {
      ctx.fillStyle = l.cor;
      ctx.fillRect(cursor, legY - 13, 18, 18);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(l.rotulo, cursor + 26, legY + 2);
      cursor += 26 + ctx.measureText(l.rotulo).width + 18;
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
