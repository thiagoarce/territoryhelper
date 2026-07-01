<script lang="ts">
  import AdminMapa from '$lib/components/AdminMapa.svelte';
  import type { DesignacaoEnriquecida, QuadraGeo, CoberturaQuadra } from '$lib/server/queries';

  interface CampanhaAtiva {
    id: number;
    nome: string;
    data_inicio: string;
    data_alvo: string;
    meta_semanal: number | null;
    concluidas_no_periodo: number;
    total_meta: number;
  }

  let {
    data
  }: {
    data: {
      abertas: DesignacaoEnriquecida[];
      concluidas: DesignacaoEnriquecida[];
      quadrasMap: Record<string, QuadraGeo>;
      cobertura: Record<string, CoberturaQuadra>;
      tces: { id: string; nome: string; tipo: string; prazo: string | null; status: string }[];
      campanhaAtiva: CampanhaAtiva | null;
      minhaRole: string | undefined;
    };
  } = $props();

  let aba: 'abertas' | 'concluidas' = $state('abertas');
  const lista = $derived(aba === 'abertas' ? data.abertas : data.concluidas);

  // Divisão pessoal vs pregação (arranjo) — specs.md Fase 2
  const pessoais = $derived(lista.filter((d: any) => d.tipo !== 'arranjo'));
  const pregacoes = $derived(lista.filter((d: any) => d.tipo === 'arranjo'));

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

<div class="p-4">
{#if data.campanhaAtiva}
  {@const c = data.campanhaAtiva}
  {@const pct = c.total_meta > 0 ? Math.round((c.concluidas_no_periodo / c.total_meta) * 100) : 0}
  <a
    href="/publicador/campanha"
    class="block mb-4 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 shadow-sm hover:shadow transition-shadow"
  >
    <div class="flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-xs opacity-80 uppercase tracking-wider">Campanha ativa</div>
        <div class="text-lg font-bold truncate">{c.nome}</div>
      </div>
      <div class="text-2xl font-bold">{pct}%</div>
    </div>
    <div class="mt-2 h-2 rounded-full bg-white/20 overflow-hidden">
      <div class="h-full bg-white" style:width="{pct}%"></div>
    </div>
    <div class="mt-2 flex justify-between text-xs opacity-90">
      <span>{c.concluidas_no_periodo}/{c.total_meta} quadras</span>
      <span>{new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} → {new Date(c.data_alvo + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
    </div>
  </a>
{/if}

<div>
  <h1 class="text-2xl font-bold">
    {data.minhaRole === 'admin' || data.minhaRole === 'dirigente'
      ? 'Designações ativas'
      : 'Minha carteira'}
  </h1>
  <p class="mt-1 text-sm text-slate-500">
    {#if data.minhaRole === 'admin' || data.minhaRole === 'dirigente'}
      Você vê tudo. Publicador comum vê só as próprias.
    {:else}
      Território pessoal + pregação em grupo.
    {/if}
  </p>
</div>

{#if quadrasMapa.length > 0 && aba === 'abertas'}
  <div class="mt-4">
    <AdminMapa quadras={quadrasMapa} altura={220} onQuadraClick={(q) => (window.location.href = '/publicador/quadra/' + encodeURIComponent(q.id))} />
  </div>
{/if}

<!-- TCEs designados -->
{#if data.tces && data.tces.length > 0}
  <div class="mt-4">
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2">🏪 Territórios comerciais</h2>
    <div class="space-y-2">
      {#each data.tces as t}
        <a href="/publicador/tce/{t.id}" class="block rounded-lg border border-purple-200 bg-purple-50 p-3 hover:bg-purple-100 transition-colors">
          <div class="font-medium flex items-center justify-between">
            {t.nome}
            {#if t.prazo}<span class="text-xs text-amber-700">prazo {t.prazo}</span>{/if}
          </div>
          <div class="text-xs text-slate-500 mt-0.5">{t.tipo} · toque pra trabalhar</div>
        </a>
      {/each}
    </div>
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

{#snippet cardDesignacao(d: DesignacaoEnriquecida)}
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
              <span class="inline-block w-2 h-2 rounded" style:background-color={q?.color ?? '#999'}></span>
              <span>{qid}</span>
              {#if cov && cov.total > 0}<span class="text-[10px] text-slate-500">{cov.feitas}/{cov.total}</span>{/if}
            </a>
          {/each}
        </div>
        {#if d.notas}<div class="mt-2 text-sm text-slate-600 italic">{d.notas}</div>{/if}
      </div>
    </div>
    {#if d.prazo}
      <div class="mt-3 text-xs text-slate-500">
        Prazo: <strong>{new Date(d.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
        <span class="ml-1 text-slate-400">({diasAteOuApos(d.prazo)})</span>
      </div>
    {/if}
  </div>
{/snippet}

<div class="mt-4 space-y-4">
  <section>
    <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
      🎯 Território pessoal
      <span class="text-xs text-slate-400 normal-case font-normal">({pessoais.length})</span>
    </h2>
    {#if pessoais.length === 0}
      <div class="text-sm text-slate-400 italic bg-slate-50 rounded-lg p-3">Sem designação pessoal no momento.</div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2">
        {#each pessoais as d (d.id)}{@render cardDesignacao(d)}{/each}
      </div>
    {/if}
  </section>

  {#if pregacoes.length > 0}
    <section>
      <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
        🚶 Pregação em grupo
        <span class="text-xs text-slate-400 normal-case font-normal">({pregacoes.length})</span>
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each pregacoes as d (d.id)}{@render cardDesignacao(d)}{/each}
      </div>
    </section>
  {/if}
</div>
</div>
