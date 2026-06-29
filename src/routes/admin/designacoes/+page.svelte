<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import type { DesignacaoEnriquecida, QuadraEnriquecida } from '$lib/server/queries';
  import type { Profile } from '$lib/types';

  let {
    data,
    form
  }: {
    data: {
      designacoes: DesignacaoEnriquecida[];
      publicadores: Pick<Profile, 'id' | 'nome' | 'role'>[];
      quadras: QuadraEnriquecida[];
    };
    form: any;
  } = $props();

  let mostrarNovo = $state(false);
  let editando: DesignacaoEnriquecida | null = $state(null);
  let buscaQuadra = $state('');
  let quadrasSelecionadas = $state<Set<string>>(new Set());

  function abrirEditar(d: DesignacaoEnriquecida) {
    editando = d;
    quadrasSelecionadas = new Set(d.quadras_ids);
    mostrarNovo = true;
  }

  const quadrasFiltradas = $derived(
    !buscaQuadra.trim()
      ? data.quadras
      : data.quadras.filter((q) =>
          q.id.toLowerCase().includes(buscaQuadra.toLowerCase()) ||
          (q.territorio_nome || '').toLowerCase().includes(buscaQuadra.toLowerCase())
        )
  );

  function toggleQuadra(id: string) {
    if (quadrasSelecionadas.has(id)) quadrasSelecionadas.delete(id);
    else quadrasSelecionadas.add(id);
    quadrasSelecionadas = new Set(quadrasSelecionadas); // trigger reativo
  }

  function resetForm() {
    mostrarNovo = false;
    editando = null;
    quadrasSelecionadas = new Set();
    buscaQuadra = '';
  }

  let filtroStatus = $state<'todas' | 'aberta' | 'concluida' | 'cancelada'>('todas');
  const designacoesFiltradas = $derived(
    filtroStatus === 'todas'
      ? data.designacoes
      : data.designacoes.filter((d) => d.status === filtroStatus)
  );

  const statusClasses: Record<string, string> = {
    aberta: 'bg-blue-100 text-blue-700',
    concluida: 'bg-green-100 text-green-700',
    cancelada: 'bg-slate-100 text-slate-500'
  };
</script>

<div class="flex items-end justify-between gap-4 flex-wrap">
  <div>
    <h1 class="text-2xl font-bold">Designações</h1>
    <p class="text-sm text-slate-500 mt-1">{data.designacoes.length} total</p>
  </div>
  <button
    onclick={() => (mostrarNovo ? resetForm() : (mostrarNovo = true))}
    class="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
  >
    {mostrarNovo ? 'Cancelar' : '+ Nova designação'}
  </button>
</div>

{#if form?.erro}
  <div class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{form.erro}</div>
{/if}
{#if form?.ok && form?.msg}
  <div class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700">{form.msg}</div>
{/if}

<!-- Form de nova/editar designação -->
{#if mostrarNovo}
  <form
    method="POST"
    action={editando ? '?/atualizar' : '?/criar'}
    use:enhance={() => async ({ update }) => {
      await update();
      await invalidateAll();
      if (form?.ok) resetForm();
    }}
    class="mt-4 rounded-lg border border-slate-200 bg-white p-4 space-y-4"
  >
    {#if editando}
      <input type="hidden" name="id" value={editando.id} />
      <div class="text-xs text-slate-500">Editando designação #{editando.id}</div>
    {/if}
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label for="publicador_id" class="mb-1 block text-sm font-medium">Publicador</label>
        <select
          id="publicador_id"
          name="publicador_id"
          required={!editando}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">— escolha —</option>
          {#each data.publicadores as p}
            <option value={p.id} selected={editando?.publicador_id === p.id}>{p.nome} ({p.role})</option>
          {/each}
        </select>
      </div>
      <div>
        <label for="prazo" class="mb-1 block text-sm font-medium">Prazo (opcional)</label>
        <input
          id="prazo"
          name="prazo"
          type="date"
          value={editando?.prazo ?? ''}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
    </div>

    <div>
      <label for="notas" class="mb-1 block text-sm font-medium">Notas (opcional)</label>
      <textarea
        id="notas"
        name="notas"
        rows="2"
        placeholder="Ex: começar pelo prédio Solar"
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      >{editando?.notas ?? ''}</textarea>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium" for="busca-quadra">
          Quadras ({quadrasSelecionadas.size} selecionada(s))
        </label>
        <input
          id="busca-quadra"
          type="search"
          bind:value={buscaQuadra}
          placeholder="Filtrar..."
          class="rounded border border-slate-300 px-2 py-1 text-xs w-48"
        />
      </div>
      <div class="max-h-64 overflow-y-auto rounded border border-slate-200 p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
        {#each quadrasFiltradas as q (q.id)}
          <button
            type="button"
            onclick={() => toggleQuadra(q.id)}
            class="text-left px-2 py-1.5 rounded text-sm border transition-colors"
            class:bg-primary-50={quadrasSelecionadas.has(q.id)}
            class:border-primary-500={quadrasSelecionadas.has(q.id)}
            class:border-slate-200={!quadrasSelecionadas.has(q.id)}
            class:hover:bg-slate-50={!quadrasSelecionadas.has(q.id)}
          >
            <span
              class="inline-block w-2 h-2 rounded mr-1 align-middle"
              style:background-color={q.color}
            ></span>
            <span class="font-mono font-semibold">{q.id}</span>
            {#if q.territorio_nome}
              <span class="text-xs text-slate-500 block">{q.territorio_nome}</span>
            {/if}
          </button>
        {:else}
          <div class="col-span-full text-center text-slate-400 py-4 text-sm">
            {data.quadras.length === 0 ? 'Importe os dados primeiro.' : 'Nenhuma quadra bate.'}
          </div>
        {/each}
      </div>
      <!-- Hidden inputs pra enviar as quadras selecionadas no submit -->
      {#each [...quadrasSelecionadas] as qid}
        <input type="hidden" name="quadras_ids" value={qid} />
      {/each}
    </div>

    <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
      <button type="button" onclick={resetForm} class="rounded px-3 py-2 text-sm hover:bg-slate-100">
        Cancelar
      </button>
      <button
        type="submit"
        disabled={quadrasSelecionadas.size === 0}
        class="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {editando ? 'Salvar' : 'Criar designação'}
      </button>
    </div>
  </form>
{/if}

<!-- Filtros + lista -->
<div class="mt-4 flex gap-2">
  {#each [['todas', 'Todas'], ['aberta', 'Abertas'], ['concluida', 'Concluídas'], ['cancelada', 'Canceladas']] as [k, label]}
    <button
      onclick={() => (filtroStatus = k as any)}
      class="px-3 py-1 text-sm rounded border"
      class:bg-primary-100={filtroStatus === k}
      class:border-primary-500={filtroStatus === k}
      class:text-primary-700={filtroStatus === k}
      class:border-slate-200={filtroStatus !== k}
      class:text-slate-600={filtroStatus !== k}
    >
      {label}
    </button>
  {/each}
</div>

<div class="mt-4 space-y-3">
  {#each designacoesFiltradas as d (d.id)}
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-semibold">{d.publicador_nome ?? '(sem publicador)'}</h3>
            <span class="rounded px-2 py-0.5 text-xs {statusClasses[d.status] ?? 'bg-slate-100 text-slate-600'}">
              {d.status}
            </span>
            {#if d.prazo}
              <span class="text-xs text-slate-500">prazo: <strong>{d.prazo}</strong></span>
            {/if}
          </div>
          <div class="mt-1 text-sm text-slate-600">
            <span class="font-medium">{d.quadras_ids.length} quadra(s):</span>
            <span class="font-mono text-xs">{d.quadras_ids.join(', ') || '—'}</span>
          </div>
          {#if d.notas}
            <div class="mt-1 text-sm text-slate-500 italic">{d.notas}</div>
          {/if}
          <div class="mt-1 text-xs text-slate-400">
            criada em {new Date(d.criada_em).toLocaleString('pt-BR')}
          </div>
        </div>
        <div class="flex flex-col gap-1 text-sm">
          <button onclick={() => abrirEditar(d)} class="text-primary-700 hover:underline">✎ Editar</button>
          {#if d.status === 'aberta'}
            <form method="POST" action="?/mudarStatus" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="status" value="concluida" />
              <button class="text-green-700 hover:underline">✓ Concluir</button>
            </form>
            <form method="POST" action="?/mudarStatus" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="status" value="cancelada" />
              <button class="text-slate-500 hover:underline">✕ Cancelar</button>
            </form>
          {:else}
            <form method="POST" action="?/mudarStatus" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="status" value="aberta" />
              <button class="text-blue-600 hover:underline">↻ Reabrir</button>
            </form>
          {/if}
          <form
            method="POST"
            action="?/excluir"
            use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}
            onsubmit={(e) => { if (!confirm('Excluir essa designação? Não tem volta.')) e.preventDefault(); }}
          >
            <input type="hidden" name="id" value={d.id} />
            <button class="text-red-700 hover:underline">🗑 Excluir</button>
          </form>
        </div>
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center text-center py-10 px-4">
      <div class="text-5xl mb-3 opacity-60">📋</div>
      <div class="text-base font-medium text-slate-700">Nenhuma designação ainda</div>
      <div class="text-sm text-slate-500 mt-1">Clica em "+ Nova designação" pra atribuir quadras a um publicador.</div>
    </div>
  {/each}
</div>
