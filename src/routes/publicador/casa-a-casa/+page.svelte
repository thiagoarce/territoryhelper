<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let { data }: { data: { quadras: QuadraGeo[] } } = $props();

  function abrirQuadra(q: QuadraGeo) {
    window.location.href = '/publicador/quadra/' + encodeURIComponent(q.id);
  }
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Casa a casa</h1>
    <p class="text-sm text-slate-500">Seu território agora — use o ponto azul (sua posição) pra saber em qual quadra você está.</p>
  </div>

  {#if data.quadras.length === 0}
    <Card padding="md">
      <div class="text-center py-8">
        <Icon nome="door" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Nenhum território designado agora</div>
        <p class="text-sm text-slate-400 mt-1">Território pessoal, parte de pregação em grupo ou arranjo que você dirige aparecem aqui.</p>
      </div>
    </Card>
  {:else}
    <Card padding="sm">
      <AdminMapa quadras={data.quadras} altura={360} destacarIds={data.quadras.map((q) => q.id)} onQuadraClick={abrirQuadra} />
    </Card>

    <div class="flex flex-wrap gap-1.5">
      {#each data.quadras as q (q.id)}
        <a href="/publicador/quadra/{encodeURIComponent(q.id)}"
          class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100">
          <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
          <span>{q.id}</span>
        </a>
      {/each}
    </div>
  {/if}

  <a href="/publicador/predios" class="block rounded-xl border-2 border-primary-200 bg-primary-50 p-3 hover:bg-primary-100 transition-colors">
    <div class="flex items-center gap-2 text-primary-900 font-medium text-sm">
      <Icon nome="search" size={16} /> Pesquise os prédios do território
    </div>
    <p class="text-xs text-primary-700 mt-0.5">Busca por endereço, GPS de proximidade e designar cartas →</p>
  </a>
</div>
