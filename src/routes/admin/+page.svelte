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
      registrosMes: number;
      porDia: Record<string, number>;
      porTipo: Record<string, number>;
      prazosVencendo: DesignacaoEnriquecida[];
    };
  } = $props();

  let quadraSelecionada: QuadraGeo | null = $state(null);
  let sheetOpen = $state(false);
  let densidade = $state(false);

  // Calcula altura das barras do gráfico sparkline
  const ultimos14Dias = $derived.by(() => {
    const dias: { dia: string; n: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = d.toISOString().substring(0, 10);
      dias.push({ dia: k, n: data.porDia[k] ?? 0 });
    }
    return dias;
  });
  const maxN = $derived(Math.max(1, ...ultimos14Dias.map((d) => d.n)));

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

<!-- Stats últimos 30 dias -->
<div class="mt-4 grid gap-4 md:grid-cols-2">
  <Card padding="md">
    <div class="flex items-end justify-between mb-3">
      <div>
        <div class="text-xs text-slate-500 uppercase font-semibold">Atividade últimos 14 dias</div>
        <div class="text-2xl font-bold">{data.registrosMes}</div>
        <div class="text-xs text-slate-500">eventos no mês</div>
      </div>
    </div>
    <div class="flex items-end gap-0.5 h-12">
      {#each ultimos14Dias as d}
        <div
          class="flex-1 bg-primary-500 rounded-t transition-colors hover:bg-primary-600 relative"
          style:height="{Math.max(2, (d.n / maxN) * 100)}%"
          title="{d.dia}: {d.n}"
        ></div>
      {/each}
    </div>
  </Card>

  <Card padding="md">
    <div class="text-xs text-slate-500 uppercase font-semibold mb-3">Prazos próximos / vencidos</div>
    {#if data.prazosVencendo.length === 0}
      <div class="text-sm text-slate-400">Nada vencendo nos próximos 7 dias.</div>
    {:else}
      <ul class="space-y-1 text-sm">
        {#each data.prazosVencendo.slice(0, 5) as d}
          {@const vencido = d.prazo && new Date(d.prazo + 'T12:00:00') < new Date()}
          <li class="flex justify-between gap-2">
            <span class="truncate">
              <strong>{d.publicador_nome ?? '(sem publicador)'}</strong> — {d.quadras_ids.length} quadras
            </span>
            <span class="text-xs whitespace-nowrap" class:text-red-700={vencido} class:text-amber-700={!vencido}>
              {d.prazo}{vencido ? ' (venc.)' : ''}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>

<!-- Mapa -->
<div class="mt-4">
  <AdminMapa quadras={data.quadras} altura={580} onQuadraClick={quadraClicada} {densidade} />
</div>

<!-- Legenda + toggle -->
<div class="mt-3 flex gap-3 flex-wrap text-xs items-center">
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="checkbox" bind:checked={densidade} class="w-4 h-4 rounded" />
    <span>Colorir por densidade de locais</span>
  </label>
  <span class="mx-2 text-slate-300">|</span>
  {#if densidade}
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-100"></span> 0</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-300"></span> 15</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-500"></span> 30</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-red-600"></span> 60+</span>
  {:else}
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-amber-500/60"></span> Pendente</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-green-500/60"></span> Concluída</span>
    <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3 rounded bg-slate-400/60"></span> Inativa</span>
  {/if}
  <span class="text-slate-500 ml-auto">Click numa quadra pra detalhes</span>
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
