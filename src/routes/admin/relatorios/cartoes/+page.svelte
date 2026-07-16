<script lang="ts">
  // Impressão em lote dos Cartões S-12: gera um PNG por território
  // reusando o MESMO CartaoTerritorio.svelte do compartilhamento
  // individual (/t/<token>), sequencialmente (ele cria/destrói sua
  // própria instância MapLibre a cada gerar() — não dá pra paralelizar
  // sem 2 mapas competindo pelo mesmo container oculto). "PDF" = print
  // do navegador, mesmo padrão do S-13 — cada cartão já é uma imagem, a
  // página só empilha uma por folha com quebra forçada.
  import Icon from '$lib/ui/Icon.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CacheInfoBadge from '$lib/components/CacheInfoBadge.svelte';
  import CartaoTerritorio from '$lib/components/CartaoTerritorio.svelte';
  import { centroidePoligono } from '$lib/utils/geo';
  import type { TerritorioParaCartao } from './+page';
  import type { QuadraContexto } from '$lib/components/CartaoTerritorio.svelte';

  let { data }: {
    data: {
      territorios: TerritorioParaCartao[];
      quadrasContexto: QuadraContexto[];
      cacheInfo?: { deCache: boolean; gravadoEm: number };
    };
  } = $props();

  let cartaoRef: { gerar: (o: { localidade: string; terrNumeros: string; basemap: string; limiarDias: number }) => Promise<string | null> } | null = $state(null);
  let localidade = $state('');
  let basemap = $state('positron');
  let limiarDias = $state(30);

  let gerando = $state(false);
  let progresso = $state(0);
  let pngsPorTerritorio = $state<Record<string, string>>({});
  let falharam = $state<Set<string>>(new Set());
  let destaqueIds = $state<string[]>([]);
  // Regeração INDIVIDUAL (pedido do usuário: "botão de reload caso não
  // dê certo algum na geral") — mutuamente exclusiva com o lote: o
  // CartaoTerritorio tem UM container de mapa oculto, duas gerações
  // simultâneas competiriam por ele.
  let regerandoId = $state<string | null>(null);
  const ocupado = $derived(gerando || regerandoId !== null);

  // Localidade AUTO por território (queixa real: cartões do lote saíam
  // com Localidade em branco — o preenchimento automático via Nominatim
  // só existia no compartilhamento individual). Geocodificação reversa
  // do centroide das quadras do território → bairro; cache por
  // território (regerar não re-consulta); digitou localidade manual =
  // vale pra todos os cartões. Nominatim é 1 req/s de fair use — a
  // própria geração do cartão (~2-5s cada) já espaça as chamadas.
  const localidadeCache = new Map<string, string>();
  async function localidadeDoTerritorio(t: TerritorioParaCartao): Promise<string> {
    if (localidade.trim()) return localidade.trim();
    const cacheada = localidadeCache.get(t.id);
    if (cacheada !== undefined) return cacheada;
    let achada = '';
    try {
      const ids = new Set(t.quadraIds);
      const centros = data.quadrasContexto
        .filter((q) => ids.has(q.id))
        .map((q) => centroidePoligono(q.poly_geojson))
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (centros.length > 0) {
        const lat = centros.reduce((s, c) => s + c.lat, 0) / centros.length;
        const lng = centros.reduce((s, c) => s + c.lng, 0) / centros.length;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=pt-BR`
        );
        if (res.ok) {
          const a = (await res.json())?.address ?? {};
          achada = a.suburb || a.neighbourhood || a.city_district || a.town || a.city || a.municipality || '';
        }
      }
    } catch {
      // sem geocoder o campo fica em branco — igual antes, nunca trava o lote
    }
    localidadeCache.set(t.id, achada);
    return achada;
  }

  const nomesTerritorios = $derived(
    Object.fromEntries(data.territorios.map((t) => [t.id, t.nome?.trim() || t.id]))
  );

  async function gerarPara(t: TerritorioParaCartao): Promise<boolean> {
    if (!cartaoRef) return false;
    destaqueIds = t.quadraIds;
    // Espera o $effect/re-render do CartaoTerritorio pegar o novo destaqueIds
    // antes de gerar — o componente lê a prop na hora da chamada.
    await new Promise((r) => setTimeout(r, 30));
    const png = await cartaoRef.gerar({
      localidade: await localidadeDoTerritorio(t),
      terrNumeros: t.nome?.trim() || t.id,
      basemap,
      limiarDias
    });
    const novasFalhas = new Set(falharam);
    if (png) {
      pngsPorTerritorio = { ...pngsPorTerritorio, [t.id]: png };
      novasFalhas.delete(t.id);
    } else {
      novasFalhas.add(t.id);
    }
    falharam = novasFalhas;
    return !!png;
  }

  async function gerarTodos() {
    if (ocupado) return;
    gerando = true;
    progresso = 0;
    pngsPorTerritorio = {};
    falharam = new Set();
    for (const t of data.territorios) {
      await gerarPara(t);
      progresso++;
    }
    gerando = false;
  }

  async function regerarUm(t: TerritorioParaCartao) {
    if (ocupado) return;
    regerandoId = t.id;
    try {
      await gerarPara(t);
    } finally {
      regerandoId = null;
    }
  }

  function baixar(terrId: string, png: string) {
    const a = document.createElement('a');
    a.href = png;
    a.download = `cartao-territorio-${terrId}.png`;
    a.click();
  }

  const totalGerados = $derived(Object.keys(pngsPorTerritorio).length);
</script>

<svelte:head><title>Cartões S-12 em lote</title></svelte:head>

<div class="p-4 no-print space-y-3">
  <h1 class="text-2xl font-bold">Cartões S-12 em lote</h1>
  <p class="text-sm text-slate-500">
    Gera o Cartão de Mapa de Território (S-12) de TODOS os territórios de uma vez —
    pra renovar o fichário físico inteiro sem abrir link por link.
  </p>
  <CacheInfoBadge cacheInfo={data.cacheInfo} />

  <div class="flex items-center gap-3 flex-wrap">
    <input
      bind:value={localidade}
      placeholder="Localidade (vazio = automática por território)"
      class="rounded-lg border border-slate-300 px-3 py-2 text-sm w-72"
    />
    <label class="text-sm flex items-center gap-1">
      Feito há pouco (dias)
      <input type="number" bind:value={limiarDias} min="1" class="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
    </label>
    <select bind:value={basemap} class="rounded-lg border border-slate-300 px-2 py-2 text-sm">
      <option value="positron">Positron</option>
      <option value="bright">Bright</option>
      <option value="liberty">Liberty</option>
    </select>
    <Button variant="primary" loading={gerando} disabled={ocupado} onclick={gerarTodos}>
      <Icon nome="clipboard" size={14} /> Gerar {data.territorios.length} cartão(ões)
    </Button>
    {#if totalGerados > 0 && !ocupado}
      <Button variant="secondary" onclick={() => window.print()}>
        <Icon nome="clipboard" size={14} /> Imprimir / Salvar PDF
      </Button>
    {/if}
  </div>

  {#if gerando}
    <div class="text-sm text-slate-500">Gerando {progresso}/{data.territorios.length}...</div>
  {/if}
</div>

<CartaoTerritorio bind:this={cartaoRef} quadras={data.quadrasContexto} {destaqueIds} modo="arquivo" {nomesTerritorios} />

{#if totalGerados > 0 || falharam.size > 0}
  <div class="space-y-4 p-4">
    {#each data.territorios as t}
      {#if pngsPorTerritorio[t.id]}
        <div class="folha-cartao">
          <div class="no-print flex items-center justify-end gap-2 mb-1">
            <span class="text-xs text-slate-400 mr-auto">{t.nome?.trim() || `Território ${t.id}`}</span>
            <button
              type="button"
              disabled={ocupado}
              onclick={() => regerarUm(t)}
              class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1"
              title="Gera este cartão de novo (ex: rua sem nome, tile que não carregou)"
            >
              <Icon nome="refresh" size={12} spin={regerandoId === t.id} />
              {regerandoId === t.id ? 'Regerando...' : 'Regerar'}
            </button>
            <button
              type="button"
              onclick={() => baixar(t.id, pngsPorTerritorio[t.id])}
              class="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
            >
              Baixar PNG
            </button>
          </div>
          <img src={pngsPorTerritorio[t.id]} alt="Cartão do território {t.nome ?? t.id}" class="w-full rounded border border-slate-200" />
        </div>
      {:else if falharam.has(t.id)}
        <!-- Falhou no lote (rede/Overpass/tiles) — antes sumia SILENCIOSAMENTE
             da lista e só dava pra notar contando os cartões na mão. -->
        <div class="no-print rounded-lg border border-amber-300 bg-amber-50 p-3 flex items-center gap-3">
          <Icon nome="alert" size={16} class="text-amber-600 shrink-0" />
          <span class="text-sm text-amber-800 flex-1">
            Cartão de <strong>{t.nome?.trim() || `Território ${t.id}`}</strong> falhou ao gerar (rede/mapa).
          </span>
          <button
            type="button"
            disabled={ocupado}
            onclick={() => regerarUm(t)}
            class="text-xs px-2 py-1 rounded border border-amber-400 text-amber-800 hover:bg-amber-100 disabled:opacity-40 inline-flex items-center gap-1"
          >
            <Icon nome="refresh" size={12} spin={regerandoId === t.id} />
            {regerandoId === t.id ? 'Tentando...' : 'Tentar de novo'}
          </button>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .folha-cartao {
    break-inside: avoid;
    page-break-inside: avoid;
    page-break-after: always;
  }
  @media print {
    .no-print,
    :global(header),
    :global(nav),
    :global(aside) {
      display: none !important;
    }
    :global(main) {
      padding: 0 !important;
    }
    :global(body) {
      background: #fff !important;
    }
  }
</style>
