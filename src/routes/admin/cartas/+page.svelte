<script lang="ts">
  import Card from '$lib/ui/Card.svelte';
  import type { PredioListado } from '$lib/server/queries';

  let { data }: { data: { predios: PredioListado[] } } = $props();

  let busca = $state('');
  let soComCarta = $state(false);

  const filtrados = $derived(
    data.predios.filter((p) => {
      if (soComCarta && p.qtd_carta_entregue === 0) return false;
      if (busca.trim()) {
        const b = busca.toLowerCase();
        if (!((p.nome || '').toLowerCase().includes(b) ||
              p.logradouro.toLowerCase().includes(b) ||
              p.numero.toLowerCase().includes(b)))
          return false;
      }
      return true;
    })
  );

  function pct(parcial: number, total: number): number {
    return total === 0 ? 0 : Math.round((parcial / total) * 100);
  }
</script>

<div>
  <h1 class="text-2xl font-bold">Cartas — Prédios</h1>
  <p class="text-sm text-slate-500 mt-1">{data.predios.length} prédio(s) com mais de um apartamento</p>
</div>

<div class="mt-4 flex gap-3 flex-wrap items-center">
  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar por nome, logradouro ou número..."
    class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 flex-1 max-w-md"
  />
  <label class="flex items-center gap-2 text-sm cursor-pointer">
    <input type="checkbox" bind:checked={soComCarta} class="w-4 h-4 rounded text-primary-600" />
    Só com cartas entregues
  </label>
  <div class="text-sm text-slate-500 ml-auto">Mostrando {filtrados.length}</div>
</div>

<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
  {#each filtrados as p (p.id)}
    <a href="/admin/cartas/{p.id}" class="block">
      <Card padding="md" interactive class="h-full">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">{p.nome || `${p.logradouro}, ${p.numero}`}</div>
            <div class="text-xs text-slate-500 truncate">{p.logradouro}, {p.numero}</div>
          </div>
          {#if p.quadra_id}
            <span class="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">{p.quadra_id}</span>
          {/if}
        </div>

        <div class="flex gap-1 flex-wrap text-xs mb-3">
          {#if p.tipo_entrada === 'porteiro'}<span class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Porteiro</span>{/if}
          {#if p.tipo_entrada === 'eletronica'}<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Eletrônica</span>{/if}
          {#if p.tipo_entrada === 'sem'}<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Sem</span>{/if}
          {#if p.acesso_caixas}<span class="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📬 caixas</span>{/if}
          {#if p.acesso_interfones}<span class="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">📞 interfones</span>{/if}
          {#if p.irmao_mora}<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">👤 irmão</span>{/if}
        </div>

        <div class="text-sm">
          <div class="flex justify-between mb-1">
            <span class="text-slate-500">Cartas entregues</span>
            <span class="font-semibold">{p.qtd_carta_entregue} / {p.qtd_aptos}</span>
          </div>
          <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full bg-purple-500" style:width="{pct(p.qtd_carta_entregue, p.qtd_aptos)}%"></div>
          </div>
          {#if p.qtd_desocupado > 0 || p.qtd_nao_escrever > 0}
            <div class="mt-2 text-xs text-slate-500 flex gap-2">
              {#if p.qtd_desocupado > 0}<span>🏚 {p.qtd_desocupado} desoc.</span>{/if}
              {#if p.qtd_nao_escrever > 0}<span>🚫 {p.qtd_nao_escrever} não escrever</span>{/if}
            </div>
          {/if}
        </div>
      </Card>
    </a>
  {:else}
    <div class="col-span-full flex flex-col items-center text-center py-10 px-4">
      <div class="text-5xl mb-3 opacity-60">🏢</div>
      <div class="text-base font-medium text-slate-700">Nenhum prédio bate</div>
      <div class="text-sm text-slate-500 mt-1">Limpe os filtros pra ver mais.</div>
    </div>
  {/each}
</div>
