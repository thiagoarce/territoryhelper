<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Card from '$lib/ui/Card.svelte';
  import type { Campanha } from '$lib/types';
  import type { CampanhaResumo } from './+page.server';

  let { data }: {
    data: {
      ativa: CampanhaResumo | null;
      objetivos: Campanha[];
    };
  } = $props();

  const MODALIDADES = [
    { v: 'casa', icone: 'home', label: 'Casa em casa' },
    { v: 'comercial', icone: 'store', label: 'Comercial' },
    { v: 'rural', icone: 'wheat', label: 'Rural' },
    { v: 'cartas', icone: 'mail', label: 'Cartas' },
    { v: 'telefone', icone: 'phone', label: 'Telefone' },
    { v: 'publico', icone: 'megaphone', label: 'Testemunho público' }
  ];

  const porModalidade = $derived.by(() => {
    const m = new Map<string, Campanha[]>();
    for (const o of data.objetivos) {
      const arr = m.get(o.modalidade) ?? [];
      arr.push(o);
      m.set(o.modalidade, arr);
    }
    return m;
  });

  function fmtData(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  const pct = $derived(
    data.ativa && data.ativa.total_meta > 0
      ? Math.round((data.ativa.concluidas_no_periodo / data.ativa.total_meta) * 100)
      : 0
  );
</script>

<div class="p-4 space-y-3">
  <div>
    <h1 class="text-2xl font-bold">Campanha</h1>
    {#if data.ativa}
      <p class="text-sm text-slate-500">{fmtData(data.ativa.data_inicio)} → {fmtData(data.ativa.data_alvo)}</p>
    {/if}
  </div>

  {#if !data.ativa}
    <Card padding="md">
      <div class="text-center py-6">
        <Icon nome="calendar" size={40} class="mx-auto text-slate-300" />
        <div class="font-medium mt-2">Sem campanha ativa</div>
      </div>
    </Card>
  {:else}
    {@const c = data.ativa}

    {#if c.status === 'planejada'}
      <div class="rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 text-white p-4 shadow-sm">
        <div class="flex items-center gap-3">
          {#if c.imagemUrl}<img src={c.imagemUrl} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 shadow" />{/if}
          <div class="flex-1 min-w-0">
            <div class="text-xs opacity-80 uppercase tracking-wider">Campanha se aproxima</div>
            <div class="text-lg font-bold truncate">{c.nome}</div>
            <div class="mt-1 text-sm opacity-90">Faltam {c.diasParaComecar} dia(s) pra começar</div>
          </div>
        </div>
      </div>
    {:else}
      <div class="rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          {#if c.imagemUrl}<img src={c.imagemUrl} alt="" class="w-14 h-14 rounded-lg object-cover shrink-0 shadow" />{/if}
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
          <span>{c.concluidas_no_periodo}/{c.total_meta} quadras concluídas</span>
          <span>{c.diasRestantes === 0 ? 'último dia' : `${c.diasRestantes} dia(s) restantes`}</span>
        </div>
      </div>

      {#if c.meta_semanal}
        {@const noRitmo = c.concluidas_semana >= c.meta_semanal}
        <div class="rounded-xl border p-3 flex items-center gap-3 {noRitmo ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}">
          <Icon nome={noRitmo ? 'check' : 'alert'} size={18} class={noRitmo ? 'text-green-600' : 'text-amber-600'} />
          <div class="text-sm {noRitmo ? 'text-green-900' : 'text-amber-900'}">
            <strong>{c.concluidas_semana}</strong> quadra(s) nos últimos 7 dias — meta semanal: <strong>{c.meta_semanal}</strong>
            {#if !noRitmo}<span class="block text-xs mt-0.5 text-amber-700">Faltam {c.meta_semanal - c.concluidas_semana} pra bater o ritmo da semana.</span>{/if}
          </div>
        </div>
      {/if}
    {/if}

    {#if c.notasSuprimento}
      <div class="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-2">
        <Icon nome="inbox" size={16} class="text-slate-500 shrink-0 mt-0.5" />
        <div class="text-sm text-slate-700">
          <span class="block text-[10px] uppercase tracking-wider font-semibold text-slate-400">Suprimento</span>
          {c.notasSuprimento}
        </div>
      </div>
    {/if}

    {#each MODALIDADES as mod}
      {@const objs = porModalidade.get(mod.v) ?? []}
      {#if objs.length > 0}
        <div>
          <h2 class="text-sm font-semibold text-slate-600 uppercase mb-2 flex items-center gap-2">
            <span><Icon nome={mod.icone} size={16} /></span> {mod.label}
          </h2>
          <div class="space-y-2">
            {#each objs as o}
              <Card padding="sm">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[10px] px-1.5 py-0.5 rounded {o.tipo === 'semana' ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}">{o.tipo}</span>
                </div>
                <div class="font-medium text-sm">{o.titulo}</div>
                {#if o.descricao}<div class="text-xs text-slate-600 mt-0.5">{o.descricao}</div>{/if}
                {#if o.link}<a href={o.link} target="_blank" rel="noopener" class="text-xs text-blue-600 hover:underline"><Icon nome="link" size={14} /> abrir link</a>{/if}
              </Card>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    {#if data.objetivos.length === 0}
      <Card padding="md">
        <div class="text-sm text-slate-500 text-center py-4">Nenhum objetivo publicado ainda.</div>
      </Card>
    {/if}
  {/if}
</div>
