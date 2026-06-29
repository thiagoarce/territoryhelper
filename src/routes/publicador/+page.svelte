<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import type { DesignacaoEnriquecida, QuadraGeo, CoberturaQuadra } from '$lib/server/queries';

  let {
    data
  }: {
    data: {
      abertas: DesignacaoEnriquecida[];
      concluidas: DesignacaoEnriquecida[];
      quadrasMap: Record<string, QuadraGeo>;
      cobertura: Record<string, CoberturaQuadra>;
      minhaRole: string | undefined;
    };
  } = $props();

  let aba: 'abertas' | 'concluidas' = $state('abertas');
  const lista = $derived(aba === 'abertas' ? data.abertas : data.concluidas);

  // Quadras envolvidas nas designações abertas — pro mini-mapa
  const quadrasMapa = $derived.by(() => {
    const ids = new Set<string>();
    for (const d of data.abertas) for (const q of d.quadras_ids) ids.add(q);
    return [...ids].map((id) => data.quadrasMap[id]).filter(Boolean);
  });

  function diasAteOuApos(dataStr: string | null): string {
    if (!dataStr) return '';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const prazo = new Date(dataStr + 'T12:00:00');
    const dias = Math.round((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    if (dias < 0) return `vencido há ${-dias}d`;
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    return `${dias} dias`;
  }
</script>

<div>
  <h1 class="text-2xl font-bold">
    {data.minhaRole === 'admin' || data.minhaRole === 'dirigente'
      ? 'Designações ativas'
      : 'Minhas designações'}
  </h1>
  <p class="mt-1 text-sm text-slate-500">
    {#if data.minhaRole === 'admin' || data.minhaRole === 'dirigente'}
      Você vê tudo. Publicador comum vê só as próprias.
    {:else}
      Os territórios que você está trabalhando.
    {/if}
  </p>
</div>

{#if quadrasMapa.length > 0 && aba === 'abertas'}
  <div class="mt-4">
    <AdminMapa quadras={quadrasMapa} altura={220} onQuadraClick={(q) => (window.location.href = '/publicador/quadra/' + encodeURIComponent(q.id))} />
  </div>
{/if}

<div class="mt-4 flex gap-2">
  {#each [['abertas', 'Abertas', data.abertas.length], ['concluidas', 'Concluídas', data.concluidas.length]] as [k, label, n]}
    <button
      onclick={() => (aba = k as any)}
      class="px-3 py-1 text-sm rounded border"
      class:bg-primary-100={aba === k}
      class:border-primary-500={aba === k}
      class:text-primary-700={aba === k}
      class:border-slate-200={aba !== k}
      class:text-slate-600={aba !== k}
    >
      {label} ({n})
    </button>
  {/each}
</div>

<div class="mt-4 grid gap-3 sm:grid-cols-2">
  {#each lista as d (d.id)}
    <div class="rounded-lg border border-slate-200 bg-white p-4 hover:shadow transition-shadow">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="text-sm text-slate-500">
            Designada em {new Date(d.criada_em).toLocaleDateString('pt-BR')}
          </div>
          {#if d.publicador_nome && (data.minhaRole === 'admin' || data.minhaRole === 'dirigente')}
            <div class="text-sm font-medium text-primary-700">{d.publicador_nome}</div>
          {/if}
          <div class="mt-2 text-sm font-semibold">{d.quadras_ids.length} quadra(s)</div>
          <div class="mt-2 flex flex-wrap gap-1.5">
            {#each d.quadras_ids as qid}
              {@const q = data.quadrasMap[qid]}
              {@const cov = data.cobertura[qid]}
              <a
                href="/publicador/quadra/{encodeURIComponent(qid)}"
                class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-mono border border-slate-200 hover:bg-slate-100 hover:border-primary-500 transition-colors"
              >
                <span
                  class="inline-block w-2 h-2 rounded"
                  style:background-color={q?.color ?? '#999'}
                ></span>
                <span>{qid}</span>
                {#if cov && cov.total > 0}
                  <span class="text-[10px] text-slate-500">{cov.feitas}/{cov.total}</span>
                {/if}
              </a>
            {/each}
          </div>
          {#if d.notas}
            <div class="mt-2 text-sm text-slate-600 italic">{d.notas}</div>
          {/if}
        </div>
      </div>
      {#if d.prazo}
        <div class="mt-3 text-xs text-slate-500">
          Prazo: <strong>{new Date(d.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
          <span class="ml-1 text-slate-400">({diasAteOuApos(d.prazo)})</span>
        </div>
      {/if}
    </div>
  {:else}
    <div class="col-span-full text-center text-slate-400 py-10">
      {#if aba === 'abertas'}
        Nenhuma designação aberta no momento.
        {#if data.minhaRole === 'publicador'}
          Aguarde o servo de território te atribuir uma quadra.
        {:else}
          Crie em /admin/designacoes.
        {/if}
      {:else}
        Nenhuma designação concluída ainda.
      {/if}
    </div>
  {/each}
</div>
