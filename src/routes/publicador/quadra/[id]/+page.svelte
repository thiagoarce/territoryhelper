<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { DadosQuadraTrabalho, LocalComUnidades, UnidadeEnriquecida } from '$lib/server/queries';
  import QuadraMap from '$lib/components/QuadraMap.svelte';

  let { data }: { data: DadosQuadraTrabalho } = $props();

  // Agrupa locais por face IBGE pra mostrar separados (cada face é um trecho da quadra)
  const porFace = $derived.by(() => {
    const grupos = new Map<string, LocalComUnidades[]>();
    for (const l of data.locais) {
      const f = l.face_ibge || '—';
      const arr = grupos.get(f) ?? [];
      arr.push(l);
      grupos.set(f, arr);
    }
    return [...grupos.entries()].sort(([a], [b]) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    });
  });

  // Estado de expansão dos prédios (default fechado)
  let abertos = $state<Set<number>>(new Set());
  function togglePredio(localId: number) {
    if (abertos.has(localId)) abertos.delete(localId);
    else abertos.add(localId);
    abertos = new Set(abertos);
  }

  // Filtro simples: todos / pendentes / feitos
  let filtro = $state<'todos' | 'pendentes' | 'feitos'>('todos');

  function unidadeFeita(u: UnidadeEnriquecida): boolean {
    return !!u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo';
  }

  function passaFiltro(u: UnidadeEnriquecida): boolean {
    if (filtro === 'todos') return true;
    const feita = unidadeFeita(u);
    return filtro === 'feitos' ? feita : !feita;
  }

  function localPassaFiltro(l: LocalComUnidades): boolean {
    return l.unidades.some(passaFiltro);
  }

  const cores: Record<string, string> = {
    naoAtendeu: 'bg-slate-200 text-slate-700',
    semConversa: 'bg-amber-200 text-amber-900',
    conversou: 'bg-green-200 text-green-900',
    carta: 'bg-purple-200 text-purple-900',
    desfeito: 'bg-slate-100 text-slate-500'
  };

  const totalUnidades = $derived(data.locais.reduce((acc, l) => acc + l.unidades.length, 0));
  const feitasUnidades = $derived(data.locais.reduce((acc, l) => acc + l.unidades.filter(unidadeFeita).length, 0));
</script>

<div class="flex items-start justify-between gap-4 flex-wrap">
  <div>
    <a href="/publicador" class="text-sm text-primary-700 hover:underline">← Designações</a>
    <h1 class="text-2xl font-bold mt-1">
      <span
        class="inline-block w-4 h-4 rounded mr-1 align-middle"
        style:background-color={data.quadra.color}
      ></span>
      Quadra {data.quadra.id}
    </h1>
    {#if data.quadra.territorio_nome}
      <div class="text-sm text-slate-500">Território {data.quadra.territorio_nome}</div>
    {/if}
  </div>
  <div class="text-sm text-slate-600">
    <div>
      <strong>{feitasUnidades}</strong> de <strong>{totalUnidades}</strong> unidade(s)
    </div>
    <div class="text-xs text-slate-400">{data.locais.length} local(is)</div>
  </div>
</div>

<!-- Mapa -->
<div class="mt-4">
  <QuadraMap
    quadraGeo={data.quadra.poly_geojson}
    quadraColor={data.quadra.color}
    locais={data.locais}
    altura={240}
  />
</div>

<!-- Filtros -->
<div class="mt-4 flex gap-2">
  {#each [['todos', 'Todos'], ['pendentes', 'Pendentes'], ['feitos', 'Feitos']] as [k, label]}
    <button
      onclick={() => (filtro = k as any)}
      class="px-3 py-1 text-sm rounded border"
      class:bg-primary-100={filtro === k}
      class:border-primary-500={filtro === k}
      class:text-primary-700={filtro === k}
      class:border-slate-200={filtro !== k}
      class:text-slate-600={filtro !== k}
    >
      {label}
    </button>
  {/each}
</div>

<div class="mt-4 space-y-4">
  {#each porFace as [face, locaisDaFace]}
    {@const visiveis = locaisDaFace.filter(localPassaFiltro)}
    {#if visiveis.length > 0}
      <div>
        <div class="text-xs uppercase font-semibold text-slate-500 mb-1">
          Face {face === '—' ? '—' : face}
          <span class="text-slate-400 font-normal">· {visiveis.length} local(is)</span>
        </div>
        <div class="space-y-2">
          {#each visiveis as l (l.id)}
            {@const ehPredio = l.tipo === 'predio' && l.unidades.length >= 2}
            {@const visUnidades = l.unidades.filter(passaFiltro)}
            <div id="local-{l.id}" class="rounded-lg border border-slate-200 bg-white transition-all">
              {#if ehPredio}
                <!-- Header clicável do prédio -->
                <button
                  type="button"
                  onclick={() => togglePredio(l.id)}
                  class="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50"
                >
                  <span class="text-xl">🏢</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold truncate">{l.nome || `${l.logradouro}, ${l.numero}`}</div>
                    <div class="text-xs text-slate-500">
                      {l.logradouro}, {l.numero} · {l.unidades.length} unidades · {l.unidades.filter(unidadeFeita).length} feitas
                    </div>
                  </div>
                  <span class="text-slate-400 text-lg">{abertos.has(l.id) ? '▼' : '▶'}</span>
                </button>
                {#if abertos.has(l.id)}
                  <div class="border-t border-slate-100">
                    {#each visUnidades as u (u.id)}
                      <div class="px-3 py-2 border-b border-slate-100 last:border-b-0">
                        <div class="flex items-center justify-between gap-2 mb-1">
                          <span class="font-mono text-sm">
                            {u.complemento || `Apto ${u.id}`}
                            {#if u.carta_entregue}<span class="text-purple-600 ml-1" title="carta entregue">✉</span>{/if}
                          </span>
                          {#if u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo'}
                            <span class="text-xs rounded px-2 py-0.5 {cores[u.ultimo_tipo] ?? 'bg-slate-100'}">
                              {u.ultimo_tipo}
                            </span>
                          {/if}
                        </div>
                        {@render botoes(u)}
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else}
                <!-- Casa / comércio / etc — só 1 unidade visível direto -->
                {#each visUnidades as u (u.id)}
                  <div class="p-3">
                    <div class="flex items-center justify-between gap-2 mb-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold truncate">
                          {l.nome || `${l.logradouro}, ${l.numero}`}
                          {#if u.carta_entregue}<span class="text-purple-600 ml-1" title="carta entregue">✉</span>{/if}
                        </div>
                        <div class="text-xs text-slate-500">
                          {l.tipo} · {l.logradouro}, {l.numero}{u.complemento ? ' · ' + u.complemento : ''}
                        </div>
                      </div>
                      {#if u.ultimo_tipo && u.ultimo_tipo !== 'desfeito' && u.ultimo_tipo !== 'carta_undo'}
                        <span class="text-xs rounded px-2 py-0.5 {cores[u.ultimo_tipo] ?? 'bg-slate-100'}">
                          {u.ultimo_tipo}
                        </span>
                      {/if}
                    </div>
                    {@render botoes(u)}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="text-center text-slate-400 py-10">
      Nenhuma unidade ainda nessa quadra.
    </div>
  {/each}
</div>

{#snippet botoes(u: UnidadeEnriquecida)}
  {@const cartaMarcada = !!u.carta_entregue}
  <div class="flex gap-1 flex-wrap">
    {#each [
      { tipo: 'naoAtendeu', icon: '🚪', label: 'Não atendeu' },
      { tipo: 'semConversa', icon: '📞', label: 'Sem palestra' },
      { tipo: 'conversou', icon: '✓', label: 'Conversou' }
    ] as opt}
      {@const ativo = u.ultimo_tipo === opt.tipo}
      <form
        method="POST"
        action="?/marcarDesfecho"
        use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
      >
        <input type="hidden" name="unidade_id" value={u.id} />
        <input type="hidden" name="tipo" value={ativo ? '' : opt.tipo} />
        <button
          type="submit"
          title={opt.label}
          class="px-3 py-1.5 rounded text-sm border transition-colors"
          class:bg-primary-600={ativo}
          class:text-white={ativo}
          class:border-primary-600={ativo}
          class:hover:bg-slate-100={!ativo}
          class:border-slate-300={!ativo}
        >
          {opt.icon} <span class="hidden sm:inline">{opt.label}</span>
        </button>
      </form>
    {/each}
    <form
      method="POST"
      action="?/toggleCarta"
      use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
    >
      <input type="hidden" name="unidade_id" value={u.id} />
      <input type="hidden" name="marcar" value={cartaMarcada ? 'false' : 'true'} />
      <button
        type="submit"
        title="Carta entregue"
        class="px-3 py-1.5 rounded text-sm border transition-colors"
        class:bg-purple-600={cartaMarcada}
        class:text-white={cartaMarcada}
        class:border-purple-600={cartaMarcada}
        class:hover:bg-slate-100={!cartaMarcada}
        class:border-slate-300={!cartaMarcada}
      >
        ✉ <span class="hidden sm:inline">Carta</span>
      </button>
    </form>
  </div>
{/snippet}
