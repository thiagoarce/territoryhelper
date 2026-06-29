<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/ui/Card.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { toast } from '$lib/ui/toast.svelte';
  import type { QuadraGeo } from '$lib/server/queries';

  let { data, form }: { data: { quadras: QuadraGeo[] }; form: any } = $props();

  let selecionadas = $state<Set<string>>(new Set());
  let dataMassa = $state(new Date().toISOString().substring(0, 10));
  let busca = $state('');
  let filtroStatus = $state<'todos' | 'pendente' | 'concluido' | 'inativa'>('pendente');
  let salvando = $state(false);

  const filtradas = $derived(
    data.quadras.filter((q) => {
      if (filtroStatus !== 'todos' && q.status !== filtroStatus) return false;
      if (busca.trim() && !q.id.toLowerCase().includes(busca.toLowerCase())
          && !(q.territorio_nome || '').toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    })
  );

  function toggle(id: string) {
    if (selecionadas.has(id)) selecionadas.delete(id);
    else selecionadas.add(id);
    selecionadas = new Set(selecionadas);
  }

  function selecionarTodas() {
    for (const q of filtradas) selecionadas.add(q.id);
    selecionadas = new Set(selecionadas);
  }
  function limparSelecao() { selecionadas = new Set(); }

  // Calcula "idade" da última conclusão pra gradient temporal
  function diasDesde(dataStr: string | null): number | null {
    if (!dataStr) return null;
    const d = new Date(dataStr + 'T12:00:00');
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }
  function corGradient(dias: number | null): string {
    if (dias == null) return 'bg-slate-50';
    if (dias < 30) return 'bg-green-100';
    if (dias < 90) return 'bg-green-50';
    if (dias < 180) return 'bg-amber-50';
    if (dias < 365) return 'bg-orange-50';
    return 'bg-red-50';
  }
</script>

<div>
  <h1 class="text-2xl font-bold">Registro de conclusões</h1>
  <p class="text-sm text-slate-500 mt-1">Marca várias quadras como concluídas numa data específica</p>
</div>

<!-- Toolbar de filtros -->
<div class="mt-4 flex gap-2 flex-wrap items-center">
  <input
    type="search"
    bind:value={busca}
    placeholder="Buscar quadra ou território..."
    class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 w-56"
  />
  <div class="flex gap-1">
    {#each [['todos', 'Todos'], ['pendente', 'Pendentes'], ['concluido', 'Concluídas'], ['inativa', 'Inativas']] as [k, l]}
      <button
        onclick={() => (filtroStatus = k as any)}
        class="px-3 py-1.5 text-sm rounded border transition-colors"
        class:bg-primary-100={filtroStatus === k}
        class:border-primary-500={filtroStatus === k}
        class:text-primary-700={filtroStatus === k}
        class:border-slate-200={filtroStatus !== k}
        class:hover:bg-slate-50={filtroStatus !== k}
      >{l}</button>
    {/each}
  </div>
  <div class="text-sm text-slate-500 ml-auto">{filtradas.length} quadra(s)</div>
</div>

<!-- Barra de ações em massa (fixa quando tem seleção) -->
{#if selecionadas.size > 0}
  <Card padding="md" class="mt-4 sticky top-2 z-20 shadow-md">
    <div class="flex items-center gap-3 flex-wrap">
      <div class="text-sm font-medium">{selecionadas.size} selecionada(s)</div>

      <form
        method="POST"
        action="?/marcarConcluidas"
        use:enhance={() => {
          salvando = true;
          return async ({ result, update }) => {
            await update();
            salvando = false;
            if (result.type === 'success') {
              toast.success((result.data as any)?.msg || 'OK');
              limparSelecao();
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(String((result.data as any)?.erro || 'Falhou'));
            }
          };
        }}
        class="flex items-center gap-2"
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <input
          name="data"
          type="date"
          bind:value={dataMassa}
          class="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <Button variant="success" type="submit" loading={salvando}>✓ Marcar concluídas</Button>
      </form>

      <form
        method="POST"
        action="?/reverter"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') { toast.info('Revertidas'); limparSelecao(); await invalidateAll(); }
        }}
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <Button variant="secondary" type="submit">↻ Reverter</Button>
      </form>

      <form
        method="POST"
        action="?/marcarInativa"
        use:enhance={() => async ({ result, update }) => {
          await update();
          if (result.type === 'success') { toast.info('Marcadas inativas'); limparSelecao(); await invalidateAll(); }
        }}
        onsubmit={(e) => { if (!confirm('Marcar como inativa (não conta nas contagens)?')) e.preventDefault(); }}
      >
        {#each [...selecionadas] as id}<input type="hidden" name="ids" value={id} />{/each}
        <Button variant="ghost" type="submit">∅ Inativa</Button>
      </form>

      <button onclick={limparSelecao} class="ml-auto text-sm text-slate-500 hover:underline">Limpar</button>
    </div>
  </Card>
{/if}

<!-- Grid de quadras (mais compacto que tabela) -->
<div class="mt-4">
  <div class="mb-2 flex gap-2 text-xs">
    <button onclick={selecionarTodas} class="text-primary-700 hover:underline">Selecionar tudo na lista</button>
  </div>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
    {#each filtradas as q (q.id)}
      {@const dias = diasDesde(q.data_conclusao)}
      {@const sel = selecionadas.has(q.id)}
      <button
        type="button"
        onclick={() => toggle(q.id)}
        class="text-left p-2 rounded-lg border-2 transition-all {sel ? 'border-primary-500 bg-primary-50' : 'border-transparent ' + corGradient(dias) + ' hover:border-slate-300'}"
      >
        <div class="flex items-center gap-1 mb-1">
          <span class="inline-block w-2 h-2 rounded" style:background-color={q.color}></span>
          <span class="font-mono font-semibold text-sm">{q.id}</span>
          {#if sel}<span class="ml-auto text-primary-600 text-xs">✓</span>{/if}
        </div>
        <div class="text-xs text-slate-500 truncate">
          {q.territorio_nome || '—'}
        </div>
        {#if q.status === 'concluido' && q.data_conclusao}
          <div class="text-[10px] text-slate-400 mt-1">{q.data_conclusao}</div>
        {:else if q.status === 'inativa'}
          <div class="text-[10px] text-slate-400 mt-1">inativa</div>
        {/if}
      </button>
    {/each}
  </div>
</div>
