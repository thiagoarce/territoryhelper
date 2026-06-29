<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import Card from '$lib/ui/Card.svelte';
  import BottomSheet from '$lib/ui/BottomSheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { QuadraGeo, DesignacaoEnriquecida } from '$lib/server/queries';

  let {
    data
  }: {
    data: {
      quadras: QuadraGeo[];
      designacoesAbertas: DesignacaoEnriquecida[];
      quadrasAlocadas: string[];
    };
  } = $props();

  let quadraSelecionada: QuadraGeo | null = $state(null);
  let sheetOpen = $state(false);

  function quadraClicada(q: QuadraGeo) {
    quadraSelecionada = q;
    sheetOpen = true;
  }

  // Stats topo
  const stats = $derived.by(() => {
    const total = data.quadras.length;
    const concluidas = data.quadras.filter((q) => q.status === 'concluido').length;
    const inativas = data.quadras.filter((q) => q.status === 'inativa').length;
    const ativas = total - inativas;
    return { total, ativas, concluidas, inativas, alocadas: data.quadrasAlocadas.length, abertas: data.designacoesAbertas.length };
  });

  // Designações que tocam a quadra selecionada
  const designacoesDestaQuadra = $derived(
    quadraSelecionada
      ? data.designacoesAbertas.filter((d) => d.quadras_ids.includes(quadraSelecionada!.id))
      : []
  );
</script>

<div class="flex items-end justify-between flex-wrap gap-3">
  <div>
    <h1 class="text-2xl font-bold">Visão geral</h1>
    <p class="text-sm text-slate-500 mt-1">Mapa de todas as quadras do território</p>
  </div>
</div>

<!-- Stats -->
<div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
  <Card padding="md">
    <div class="text-2xl font-bold">{stats.ativas}</div>
    <div class="text-xs text-slate-500">quadras ativas</div>
  </Card>
  <Card padding="md">
    <div class="text-2xl font-bold text-green-600">{stats.concluidas}</div>
    <div class="text-xs text-slate-500">concluídas</div>
  </Card>
  <Card padding="md">
    <div class="text-2xl font-bold text-blue-600">{stats.alocadas}</div>
    <div class="text-xs text-slate-500">em designação</div>
  </Card>
  <Card padding="md">
    <div class="text-2xl font-bold text-amber-600">{stats.abertas}</div>
    <div class="text-xs text-slate-500">designações abertas</div>
  </Card>
</div>

<!-- Mapa -->
<div class="mt-4">
  <AdminMapa quadras={data.quadras} altura={580} onQuadraClick={quadraClicada} />
</div>

<!-- Legenda -->
<div class="mt-3 flex gap-4 flex-wrap text-xs">
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-500/60"></span> Pendente</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span> Concluída</span>
  <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-slate-400/60"></span> Inativa</span>
  <span class="text-slate-500 ml-auto">Click numa quadra pra ver detalhes</span>
</div>

<!-- Bottom sheet com detalhes da quadra clicada -->
<BottomSheet bind:open={sheetOpen} title={quadraSelecionada ? `Quadra ${quadraSelecionada.id}` : ''}>
  {#if quadraSelecionada}
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <span class="inline-block w-4 h-4 rounded" style:background-color={quadraSelecionada.color}></span>
        <span class="text-sm">Cor da quadra</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <div class="text-xs text-slate-500">Território</div>
          <div class="font-medium">{quadraSelecionada.territorio_nome ?? '—'}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Status</div>
          <div class="font-medium capitalize">{quadraSelecionada.status}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Locais</div>
          <div class="font-medium">{quadraSelecionada.qtd_locais}</div>
        </div>
        <div>
          <div class="text-xs text-slate-500">Última conclusão</div>
          <div class="font-medium">{quadraSelecionada.data_conclusao || '—'}</div>
        </div>
      </div>

      {#if designacoesDestaQuadra.length > 0}
        <div class="rounded-lg bg-blue-50 p-3">
          <div class="text-sm font-medium mb-1">Em designação aberta:</div>
          <ul class="text-sm space-y-1">
            {#each designacoesDestaQuadra as d}
              <li>📌 {d.publicador_nome ?? '(sem publicador)'} — {d.quadras_ids.length} quadra(s){d.prazo ? ' · até ' + d.prazo : ''}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="flex gap-2 pt-2">
        <a href="/admin/quadras" class="flex-1">
          <Button variant="secondary" class="w-full">Lista de quadras</Button>
        </a>
        <a href="/admin/designacoes" class="flex-1">
          <Button variant="primary" class="w-full">Designar</Button>
        </a>
      </div>
    </div>
  {/if}
</BottomSheet>
