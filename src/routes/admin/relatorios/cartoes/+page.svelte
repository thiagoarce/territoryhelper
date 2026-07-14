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
  let destaqueIds = $state<string[]>([]);

  async function gerarTodos() {
    if (!cartaoRef) return;
    gerando = true;
    progresso = 0;
    pngsPorTerritorio = {};
    for (const t of data.territorios) {
      destaqueIds = t.quadraIds;
      // Espera o $effect/re-render do CartaoTerritorio pegar o novo destaqueIds
      // antes de gerar — o componente lê a prop na hora da chamada.
      await new Promise((r) => setTimeout(r, 30));
      const png = await cartaoRef.gerar({
        localidade,
        terrNumeros: t.nome?.trim() || t.id,
        basemap,
        limiarDias
      });
      if (png) pngsPorTerritorio = { ...pngsPorTerritorio, [t.id]: png };
      progresso++;
    }
    gerando = false;
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
      placeholder="Localidade (opcional)"
      class="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
    <Button variant="primary" loading={gerando} onclick={gerarTodos}>
      <Icon nome="clipboard" size={14} /> Gerar {data.territorios.length} cartão(ões)
    </Button>
    {#if totalGerados > 0 && !gerando}
      <Button variant="secondary" onclick={() => window.print()}>
        <Icon nome="clipboard" size={14} /> Imprimir / Salvar PDF
      </Button>
    {/if}
  </div>

  {#if gerando}
    <div class="text-sm text-slate-500">Gerando {progresso}/{data.territorios.length}...</div>
  {/if}
</div>

<CartaoTerritorio bind:this={cartaoRef} quadras={data.quadrasContexto} {destaqueIds} />

{#if totalGerados > 0}
  <div class="space-y-4 p-4">
    {#each data.territorios as t}
      {#if pngsPorTerritorio[t.id]}
        <div class="folha-cartao">
          <div class="no-print flex justify-end mb-1">
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
