<script lang="ts">
  import { goto } from '$app/navigation';

  let { data }: { data: any } = $props();

  let tabelaFiltro = $state(data.filtroTabela);
  $effect(() => {
    const url = new URL(window.location.href);
    if (tabelaFiltro) url.searchParams.set('tabela', tabelaFiltro);
    else url.searchParams.delete('tabela');
    if (url.search !== window.location.search) goto(url.toString(), { keepFocus: true, noScroll: true });
  });

  const acaoCor: Record<string, string> = {
    INSERT: 'bg-green-100 text-green-700',
    UPDATE: 'bg-blue-100 text-blue-700',
    DELETE: 'bg-red-100 text-red-700'
  };

  let expandido = $state<Set<number>>(new Set());
  function toggle(id: number) {
    if (expandido.has(id)) expandido.delete(id);
    else expandido.add(id);
    expandido = new Set(expandido);
  }
</script>

<div>
  <h1 class="text-2xl font-bold">Auditoria</h1>
  <p class="text-sm text-slate-500 mt-1">Últimas 100 mudanças no banco. Quem mudou o quê, quando.</p>
</div>

<div class="mt-4 flex items-center gap-3 flex-wrap">
  <select bind:value={tabelaFiltro} class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
    <option value="">Todas as tabelas</option>
    {#each data.tabelas as t}
      <option value={t}>{t}</option>
    {/each}
  </select>
  <div class="text-sm text-slate-500 ml-auto">{data.logs.length} eventos</div>
</div>

<div class="mt-4 space-y-1">
  {#each data.logs as l (l.id)}
    <button
      type="button"
      onclick={() => toggle(l.id)}
      class="w-full text-left p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300"
    >
      <div class="flex items-center gap-2 text-sm">
        <span class="text-xs rounded px-2 py-0.5 {acaoCor[l.acao] ?? 'bg-slate-100'}">{l.acao}</span>
        <span class="font-mono text-xs">{l.tabela}#{l.registro_id}</span>
        <span class="text-slate-500 text-xs">por <strong>{l.autor_nome}</strong></span>
        <span class="ml-auto text-xs text-slate-400">{new Date(l.ts).toLocaleString('pt-BR')}</span>
      </div>
      {#if expandido.has(l.id)}
        <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          {#if l.antes}
            <div>
              <div class="text-slate-500 mb-1">ANTES</div>
              <pre class="rounded bg-slate-50 p-2 overflow-x-auto text-xs">{JSON.stringify(l.antes, null, 2)}</pre>
            </div>
          {/if}
          {#if l.depois}
            <div>
              <div class="text-slate-500 mb-1">DEPOIS</div>
              <pre class="rounded bg-slate-50 p-2 overflow-x-auto text-xs">{JSON.stringify(l.depois, null, 2)}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </button>
  {:else}
    <div class="text-center text-slate-400 py-10">Sem eventos.</div>
  {/each}
</div>
